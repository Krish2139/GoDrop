import { pool, isDbConnected, query } from './db.js';
import { logger } from './logger.js';
import { calculateHaversineDistance, RIDE_STATES } from './stateMachine.js';
import { ridesStore } from './routes/rides.js';
import { invalidateKey, invalidatePattern, publishRealtimeEvent } from './redis.js';

async function invalidateRide(rideId) {
  await Promise.all([
    invalidateKey(`cache:rides:${rideId}`),
    invalidatePattern('cache:rides:list:*'),
  ]);
}

export const MAX_DISPATCH_RADIUS_KM = 25.0; // Ahmedabad Metro search envelope (up to Gandhinagar/GIFT City)
export const OFFER_TIMEOUT_SECONDS = parseInt(process.env.OFFER_TIMEOUT_SECONDS || '180', 10);

/**
 * In-Memory fallback store for assignments when DB is unavailable
 */
export const assignmentsStore = [];

/**
 * In-Memory fallback drivers store (mirrored with Ahmedabad coordinates)
 */
export const memoryDrivers = [
  {
    id: 'driver-seed-2',
    name: 'Priya Desai',
    phone: '+91 98980 44556',
    vehicle_model: 'Hyundai Verna (Silver)',
    license_plate: 'GJ-01-CD-5678',
    rating: 4.92,
    status: 'AVAILABLE',
    current_latitude: 23.0373,
    current_longitude: 72.5303,
  },
  {
    id: 'driver-seed-4',
    name: 'Suresh Solanki',
    phone: '+91 98980 33445',
    vehicle_model: 'Maruti Dzire (White)',
    license_plate: 'GJ-27-GH-3456',
    rating: 4.88,
    status: 'AVAILABLE',
    current_latitude: 23.0338,
    current_longitude: 72.5714,
  },
  {
    id: 'driver-seed-5',
    name: 'Deepak Joshi',
    phone: '+91 98980 55667',
    vehicle_model: 'Tata Nexon EV (Teal)',
    license_plate: 'GJ-01-IJ-7890',
    rating: 4.79,
    status: 'AVAILABLE',
    current_latitude: 23.0734,
    current_longitude: 72.6266,
  },
  {
    id: 'driver-seed-1',
    name: 'Rajesh Prajapati',
    phone: '+91 98980 11223',
    vehicle_model: 'Toyota Prius (White)',
    license_plate: 'GJ-01-AB-1234',
    rating: 4.85,
    status: 'AVAILABLE',
    current_latitude: 23.1598,
    current_longitude: 72.6842,
  },
  {
    id: 'driver-seed-3',
    name: 'Amit Mehta',
    phone: '+91 98980 77889',
    vehicle_model: 'Honda City (Black)',
    license_plate: 'GJ-01-EF-9012',
    rating: 4.70,
    status: 'OFFLINE',
    current_latitude: 23.0372,
    current_longitude: 72.5613,
  }
];

/**
 * AUTOMATIC DRIVER DISPATCH ALGORITHM
 * 1. Identify available drivers in PostgreSQL (status = 'AVAILABLE').
 * 2. Filter out offline, reserved, and on-trip drivers, plus drivers who previously rejected this ride.
 * 3. Calculate distance between pickup and driver location using the Haversine formula.
 * 4. Sort eligible drivers ascending by distance.
 * 5. Atomically reserve the nearest eligible driver using conditional UPDATE with row lock.
 * 6. Create ride_assignments record with 30s expiration.
 * 7. Transition ride to DRIVER_ASSIGNED and emit Transactional Outbox event.
 * 8. Fallback to PENDING state if no eligible driver is available.
 */
export async function dispatchRide(rideId) {
  logger.info({ rideId }, 'Executing Automatic Driver Dispatch Algorithm');

  if (isDbConnected()) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      // 1. Fetch & Lock Ride
      const rideRes = await client.query('SELECT * FROM rides WHERE id = $1 FOR UPDATE', [rideId]);
      if (rideRes.rows.length === 0) {
        await client.query('ROLLBACK');
        logger.warn({ rideId }, 'Dispatch aborted: Ride not found');
        return { success: false, error: 'NotFound', message: 'Ride not found' };
      }

      const ride = rideRes.rows[0];

      // Prevent re-dispatching already active/completed/cancelled rides
      if (!['REQUESTED', 'PENDING'].includes(ride.status)) {
        await client.query('ROLLBACK');
        logger.info({ rideId, status: ride.status }, 'Dispatch skipped: Ride already assigned or completed');
        return { 
          success: true, 
          dispatched: false, 
          message: `Ride is in status '${ride.status}', skipping dispatch.`,
          ride 
        };
      }

      // 2. Identify Available Drivers (excluding those who previously rejected/timed out on this ride)
      const candidateDriversRes = await client.query(
        `SELECT d.id, d.user_id, u.name, u.phone, d.vehicle_model, d.license_plate, d.rating,
                d.status, d.current_latitude, d.current_longitude
         FROM drivers d
         JOIN users u ON d.user_id = u.id
         WHERE d.status = 'AVAILABLE'
           AND d.id NOT IN (
             SELECT driver_id FROM ride_assignments
             WHERE ride_id = $1 AND status IN ('REJECTED', 'EXPIRED')
           )`,
        [rideId]
      );

      const candidateDrivers = candidateDriversRes.rows;

      if (candidateDrivers.length === 0) {
        // No drivers available: transition ride to PENDING
        await client.query(
          `UPDATE rides 
           SET status = 'PENDING', driver_id = NULL, updated_at = NOW() 
           WHERE id = $1`,
          [rideId]
        );

        // Outbox event
        await client.query(
          `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
           VALUES ($1, 'RIDE', $2, 'RIDE_DISPATCH_PENDING_NO_DRIVER', $3, 'PENDING')`,
          [
            `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            rideId,
            JSON.stringify({ rideId, status: 'PENDING', reason: 'No available drivers found' })
          ]
        );

        await client.query('COMMIT');
      await invalidateRide(rideId);
        logger.warn({ rideId }, 'No eligible drivers available. Ride moved to PENDING status.');
        return {
          success: true,
          dispatched: false,
          status: 'PENDING',
          message: 'No available drivers nearby. Ride queued in PENDING state for retry.',
        };
      }

      // 3. Compute Haversine Distance for all candidates
      const rankedCandidates = candidateDrivers
        .map(driver => {
          const distanceKm = calculateHaversineDistance(
            ride.pickup_latitude,
            ride.pickup_longitude,
            driver.current_latitude,
            driver.current_longitude
          );
          return {
            ...driver,
            distance_km: distanceKm,
            eta_mins: Math.max(1, Math.round(distanceKm * 3)),
          };
        })
        .filter(d => d.distance_km <= MAX_DISPATCH_RADIUS_KM)
        .sort((a, b) => a.distance_km - b.distance_km);

      if (rankedCandidates.length === 0) {
        await client.query(
          `UPDATE rides SET status = 'PENDING', driver_id = NULL, updated_at = NOW() WHERE id = $1`,
          [rideId]
        );
        await client.query('COMMIT');
      await invalidateRide(rideId);
        return {
          success: true,
          dispatched: false,
          status: 'PENDING',
          message: `No drivers within ${MAX_DISPATCH_RADIUS_KM}km radius. Ride set to PENDING.`,
        };
      }

      // 4. Atomic Driver Reservation Attempt (Loop through ranked candidates)
      let selectedDriver = null;
      for (const candidate of rankedCandidates) {
        // Atomic conditional reservation: ensures only one concurrent request can grab this driver
        const reserveRes = await client.query(
          `UPDATE drivers 
           SET status = 'RESERVED', updated_at = NOW() 
           WHERE id = $1 AND status = 'AVAILABLE' 
           RETURNING *`,
          [candidate.id]
        );

        if (reserveRes.rows.length > 0) {
          selectedDriver = { ...candidate, ...reserveRes.rows[0] };
          break; // Successfully locked driver atomically
        }
        // If 0 rows returned, driver was grabbed concurrently, continue to next candidate
        logger.info({ driverId: candidate.id, rideId }, 'Driver lock contention: Trying next nearest candidate');
      }

      if (!selectedDriver) {
        // All candidates were locked concurrently
        await client.query(
          `UPDATE rides SET status = 'PENDING', driver_id = NULL, updated_at = NOW() WHERE id = $1`,
          [rideId]
        );
        await client.query('COMMIT');
      await invalidateRide(rideId);
        return {
          success: true,
          dispatched: false,
          status: 'PENDING',
          message: 'All eligible drivers are currently reserved. Ride set to PENDING.',
        };
      }

      // 5. Create Ride Assignment Record (30s expiration)
      const assignmentId = `asgn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_SECONDS * 1000);

      const assignmentRes = await client.query(
        `INSERT INTO ride_assignments (id, ride_id, driver_id, status, distance_km, offered_at, expires_at)
         VALUES ($1, $2, $3, 'OFFERED', $4, NOW(), $5)
         RETURNING *`,
        [assignmentId, rideId, selectedDriver.id, selectedDriver.distance_km, expiresAt.toISOString()]
      );

      const assignment = assignmentRes.rows[0];

      // 6. Update Ride Record to DRIVER_ASSIGNED
      const updateRideRes = await client.query(
        `UPDATE rides 
         SET status = 'DRIVER_ASSIGNED', driver_id = $1, updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        [selectedDriver.id, rideId]
      );

      const updatedRide = updateRideRes.rows[0];

      // 7. Transactional Outbox Event (DRIVER_DISPATCH_OFFERED)
      const outboxPayload = {
        ride_id: rideId,
        assignment_id: assignmentId,
        driver_id: selectedDriver.id,
        driver_name: selectedDriver.name,
        vehicle: selectedDriver.vehicle_model,
        license_plate: selectedDriver.license_plate,
        distance_km: selectedDriver.distance_km,
        expires_at: expiresAt.toISOString(),
      };

      await client.query(
        `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ($1, 'RIDE', $2, 'DRIVER_DISPATCH_OFFERED', $3, 'PENDING')`,
        [
          `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          rideId,
          JSON.stringify(outboxPayload)
        ]
      );

      await client.query('COMMIT');
      await invalidateRide(rideId);

      // Realtime Push Stream to Driver & Ride Rooms
      publishRealtimeEvent(`driver:${selectedDriver.user_id || selectedDriver.id}`, 'dispatch:offer', {
        assignmentId,
        rideId,
        pickupAddress: ride.pickup_address,
        pickupLat: ride.pickup_latitude,
        pickupLng: ride.pickup_longitude,
        destinationAddress: ride.destination_address,
        distanceKm: selectedDriver.distance_km,
        fare: ride.fare_amount || ride.fare,
        expiresAt: expiresAt.toISOString(),
        remainingSeconds: OFFER_TIMEOUT_SECONDS,
      });

      publishRealtimeEvent(`ride:${rideId}`, 'ride:status:changed', {
        rideId,
        status: 'DRIVER_ASSIGNED',
        ride: updatedRide,
      });

      if (ride.passenger_id) {
        publishRealtimeEvent(`user:${ride.passenger_id}`, 'ride:status:changed', {
          rideId,
          status: 'DRIVER_ASSIGNED',
          ride: updatedRide,
        });
      }

      logger.info({
        rideId,
        assignedDriverId: selectedDriver.id,
        distanceKm: selectedDriver.distance_km,
        assignmentId,
        expiresAt,
      }, 'Atomic driver reservation & dispatch successfully completed');

      return {
        success: true,
        dispatched: true,
        status: 'DRIVER_ASSIGNED',
        driver: {
          id: selectedDriver.id,
          name: selectedDriver.name,
          phone: selectedDriver.phone,
          vehicle_model: selectedDriver.vehicle_model,
          license_plate: selectedDriver.license_plate,
          rating: selectedDriver.rating,
          distance_km: selectedDriver.distance_km,
          eta_mins: selectedDriver.eta_mins,
        },
        assignment: {
          id: assignmentId,
          status: 'OFFERED',
          expires_at: expiresAt.toISOString(),
          timeout_seconds: OFFER_TIMEOUT_SECONDS,
        },
        ride: updatedRide,
      };
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      logger.error(err, 'Database error during automated driver dispatch');
    } finally {
      if (client) client.release();
    }
  }

  // -------------------------------------------------------------
  // Resilient In-Memory Fallback Dispatch Logic
  // -------------------------------------------------------------
  logger.warn({ rideId }, 'PostgreSQL offline: Executing In-Memory Dispatch Engine');
  const ride = ridesStore.find(r => r.id === rideId);
  if (!ride) {
    return { success: false, error: 'NotFound', message: 'Ride not found' };
  }

  if (!['REQUESTED', 'PENDING'].includes(ride.status)) {
    return { success: true, dispatched: false, message: `Ride is in ${ride.status}, dispatch skipped.`, ride };
  }

  // Find rejected driver IDs for this ride
  const rejectedDriverIds = assignmentsStore
    .filter(a => a.ride_id === rideId && ['REJECTED', 'EXPIRED'].includes(a.status))
    .map(a => a.driver_id);

  const availableCandidates = memoryDrivers.filter(
    d => d.status === 'AVAILABLE' && !rejectedDriverIds.includes(d.id)
  );

  if (availableCandidates.length === 0) {
    ride.status = 'PENDING';
    ride.driver_id = null;
    ride.updated_at = new Date().toISOString();
    return {
      success: true,
      dispatched: false,
      status: 'PENDING',
      message: 'No available drivers nearby (In-Memory). Queued in PENDING state.',
    };
  }

  // Haversine sort
  const ranked = availableCandidates.map(d => {
    const dist = calculateHaversineDistance(
      ride.pickup_latitude,
      ride.pickup_longitude,
      d.current_latitude,
      d.current_longitude
    );
    return { ...d, distance_km: dist, eta_mins: Math.max(1, Math.round(dist * 3)) };
  }).sort((a, b) => a.distance_km - b.distance_km);

  const selectedDriver = ranked[0];
  selectedDriver.status = 'RESERVED';

  const assignmentId = `asgn-mem-${Date.now()}`;
  const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_SECONDS * 1000).toISOString();

  const assignment = {
    id: assignmentId,
    ride_id: rideId,
    driver_id: selectedDriver.id,
    status: 'OFFERED',
    distance_km: selectedDriver.distance_km,
    offered_at: new Date().toISOString(),
    expires_at: expiresAt,
  };
  assignmentsStore.push(assignment);

  ride.status = 'DRIVER_ASSIGNED';
  ride.driver_id = selectedDriver.id;
  ride.driver_name = selectedDriver.name;
  ride.vehicle_model = selectedDriver.vehicle_model;
  ride.license_plate = selectedDriver.license_plate;
  ride.driver_rating = selectedDriver.rating;
  ride.updated_at = new Date().toISOString();

  return {
    success: true,
    dispatched: true,
    status: 'DRIVER_ASSIGNED',
    source: 'InMemoryStore',
    driver: selectedDriver,
    assignment,
    ride,
  };
}

/**
 * DRIVER ACCEPTS OFFER
 */
export async function acceptOffer(rideId, driverId) {
  logger.info({ rideId, driverId }, 'Processing Driver Offer Acceptance');

  if (isDbConnected()) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      // 1. Verify active assignment or ride status
      const asgnRes = await client.query(
        `SELECT * FROM ride_assignments 
         WHERE ride_id = $1 AND driver_id = $2 AND status = 'OFFERED' 
         FOR UPDATE`,
        [rideId, driverId]
      );

      let assignmentId = null;
      if (asgnRes.rows.length === 0) {
        // Fallback: check if the ride is currently in DRIVER_ASSIGNED for this driver
        const rideCheck = await client.query(
          `SELECT * FROM rides WHERE id = $1 AND driver_id = $2 AND status = 'DRIVER_ASSIGNED'`,
          [rideId, driverId]
        );
        if (rideCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return { success: false, error: 'OfferNotFound', message: 'No active assignment found for this driver.' };
        }
      } else {
        const asgn = asgnRes.rows[0];
        assignmentId = asgn.id;
        // 2. Mark assignment ACCEPTED
        await client.query(
          `UPDATE ride_assignments SET status = 'ACCEPTED', responded_at = NOW() WHERE id = $1`,
          [asgn.id]
        );
      }

      // 3. Mark driver ON_TRIP
      await client.query(
        `UPDATE drivers SET status = 'ON_TRIP', updated_at = NOW() WHERE id = $1`,
        [driverId]
      );

      // 4. Update ride to DRIVER_ACCEPTED and query full joined driver info
      await client.query(
        `UPDATE rides SET status = 'DRIVER_ACCEPTED', updated_at = NOW() WHERE id = $1`,
        [rideId]
      );
      const fullRideRes = await client.query(
        `SELECT r.*, u.name as driver_name, u.phone as driver_phone, d.vehicle_model, d.license_plate, d.rating as driver_rating
         FROM rides r
         LEFT JOIN drivers d ON r.driver_id = d.id
         LEFT JOIN users u ON d.user_id = u.id
         WHERE r.id = $1`,
        [rideId]
      );
      const updatedRide = fullRideRes.rows[0];

      // 5. Outbox Event
      await client.query(
        `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ($1, 'RIDE', $2, 'DRIVER_ACCEPTED_OFFER', $3, 'PENDING')`,
        [
          `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          rideId,
          JSON.stringify({ rideId, driverId, assignmentId, status: 'DRIVER_ACCEPTED' })
        ]
      );

      await client.query('COMMIT');
      await invalidateRide(rideId);

      // Realtime Push Stream to Driver & Ride Rooms
      publishRealtimeEvent(`ride:${rideId}`, 'ride:status:changed', {
        rideId,
        status: 'DRIVER_ACCEPTED',
        ride: updatedRide,
      });

      if (updatedRide.passenger_id) {
        publishRealtimeEvent(`user:${updatedRide.passenger_id}`, 'ride:status:changed', {
          rideId,
          status: 'DRIVER_ACCEPTED',
          ride: updatedRide,
        });
      }

      publishRealtimeEvent(`driver:${driverId}`, 'ride:status:changed', {
        rideId,
        status: 'DRIVER_ACCEPTED',
        ride: updatedRide,
      });

      logger.info({ rideId, driverId }, 'Driver successfully accepted offer');
      return { success: true, status: 'DRIVER_ACCEPTED', ride: updatedRide };
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      logger.error(err, 'PostgreSQL error accepting offer');
    } finally {
      if (client) client.release();
    }
  }

  // In-Memory Fallback
  const asgn = assignmentsStore.find(a => a.ride_id === rideId && a.driver_id === driverId && a.status === 'OFFERED');
  if (asgn) {
    asgn.status = 'ACCEPTED';
    asgn.responded_at = new Date().toISOString();
  }
  const driver = memoryDrivers.find(d => d.id === driverId);
  if (driver) driver.status = 'ON_TRIP';

  const ride = ridesStore.find(r => r.id === rideId);
  if (ride) {
    ride.status = 'DRIVER_ACCEPTED';
    ride.updated_at = new Date().toISOString();
  }

  return { success: true, status: 'DRIVER_ACCEPTED', source: 'InMemoryStore', ride };
}

/**
 * DRIVER REJECTS OFFER
 * Automatically releases driver reservation and cascades to the next nearest eligible candidate!
 */
export async function rejectOffer(rideId, driverId, reason = 'Driver declined') {
  logger.info({ rideId, driverId, reason }, 'Processing Driver Offer Rejection with Auto-Cascading Dispatch');

  let nextDispatchResult = null;

  if (isDbConnected()) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      // 1. Mark assignment REJECTED
      await client.query(
        `UPDATE ride_assignments 
         SET status = 'REJECTED', responded_at = NOW() 
         WHERE ride_id = $1 AND driver_id = $2 AND status = 'OFFERED'`,
        [rideId, driverId]
      );

      // 2. Release driver back to AVAILABLE
      await client.query(
        `UPDATE drivers 
         SET status = 'AVAILABLE', updated_at = NOW() 
         WHERE id = $1 AND status = 'RESERVED'`,
        [driverId]
      );

      // 3. Reset Ride status to PENDING
      await client.query(
        `UPDATE rides 
         SET status = 'PENDING', driver_id = NULL, updated_at = NOW() 
         WHERE id = $1`,
        [rideId]
      );

      // 4. Outbox Event
      await client.query(
        `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ($1, 'RIDE', $2, 'DRIVER_REJECTED_OFFER', $3, 'PENDING')`,
        [
          `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          rideId,
          JSON.stringify({ rideId, driverId, reason })
        ]
      );

      await client.query('COMMIT');
      await invalidateRide(rideId);
      logger.info({ rideId, driverId }, 'Driver rejection committed: Triggering automatic re-dispatch');
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      logger.error(err, 'PostgreSQL error processing driver rejection');
    } finally {
      if (client) client.release();
    }

    // 5. Automatic Cascading Dispatch to next candidate
    nextDispatchResult = await dispatchRide(rideId);
    return {
      success: true,
      message: 'Driver rejected offer. Ride automatically re-dispatched to next eligible driver.',
      rejection: { rideId, driverId, reason },
      nextDispatch: nextDispatchResult,
    };
  }

  // In-Memory Fallback
  const asgn = assignmentsStore.find(a => a.ride_id === rideId && a.driver_id === driverId && a.status === 'OFFERED');
  if (asgn) {
    asgn.status = 'REJECTED';
    asgn.responded_at = new Date().toISOString();
  }
  const driver = memoryDrivers.find(d => d.id === driverId);
  if (driver) driver.status = 'AVAILABLE';

  const ride = ridesStore.find(r => r.id === rideId);
  if (ride) {
    ride.status = 'PENDING';
    ride.driver_id = null;
    ride.updated_at = new Date().toISOString();
  }

  nextDispatchResult = await dispatchRide(rideId);
  return {
    success: true,
    message: 'Driver rejected offer. Re-dispatched (InMemory).',
    nextDispatch: nextDispatchResult,
  };
}

/**
 * OFFER TIMEOUT / EXPIRATION
 * Called when 30s expires without a response. Releases driver and cascades to next candidate.
 */
export async function expireOffer(rideId) {
  logger.info({ rideId }, 'Processing Offer Timeout / Expiration with Auto-Cascading Dispatch');

  if (isDbConnected()) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      // Find expired offered assignment
      const asgnRes = await client.query(
        `SELECT * FROM ride_assignments 
         WHERE ride_id = $1 AND status = 'OFFERED' 
         FOR UPDATE`,
        [rideId]
      );

      if (asgnRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, message: 'No active offer found to expire' };
      }

      const asgn = asgnRes.rows[0];

      // 1. Mark assignment EXPIRED
      await client.query(
        `UPDATE ride_assignments SET status = 'EXPIRED', responded_at = NOW() WHERE id = $1`,
        [asgn.id]
      );

      // 2. Release driver back to AVAILABLE
      await client.query(
        `UPDATE drivers SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1 AND status = 'RESERVED'`,
        [asgn.driver_id]
      );

      // 3. Reset Ride status to PENDING
      await client.query(
        `UPDATE rides SET status = 'PENDING', driver_id = NULL, updated_at = NOW() WHERE id = $1`,
        [rideId]
      );

      // 4. Outbox Event
      await client.query(
        `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ($1, 'RIDE', $2, 'DRIVER_OFFER_EXPIRED', $3, 'PENDING')`,
        [
          `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          rideId,
          JSON.stringify({ rideId, driverId: asgn.driver_id, assignmentId: asgn.id })
        ]
      );

      await client.query('COMMIT');
      await invalidateRide(rideId);
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      logger.error(err, 'PostgreSQL error expiring offer');
    } finally {
      if (client) client.release();
    }

    // 5. Automatic Cascading Dispatch to next candidate
    const nextDispatch = await dispatchRide(rideId);
    return {
      success: true,
      message: 'Offer expired (30s timeout). Automatically re-dispatched to next eligible driver.',
      nextDispatch,
    };
  }

  // In-Memory Fallback
  const asgn = assignmentsStore.find(a => a.ride_id === rideId && a.status === 'OFFERED');
  if (asgn) {
    asgn.status = 'EXPIRED';
    const driver = memoryDrivers.find(d => d.id === asgn.driver_id);
    if (driver) driver.status = 'AVAILABLE';
  }
  const ride = ridesStore.find(r => r.id === rideId);
  if (ride) {
    ride.status = 'PENDING';
    ride.driver_id = null;
  }
  const nextDispatch = await dispatchRide(rideId);
  return { success: true, message: 'Offer expired (InMemory). Re-dispatched.', nextDispatch };
}

