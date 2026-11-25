import express from 'express';
import { query, isDbConnected, pool } from '../db.js';
import { logger } from '../logger.js';
import { publishRealtimeEvent, getRedisClient, invalidateKey, invalidatePattern } from '../redis.js';
import { dispatchRide } from '../dispatchEngine.js';

const router = express.Router();

export const sosIncidentsStore = [];

/**
 * Find an active (non-completed, non-cancelled) rescue ride for a passenger/incident,
 * or create a fresh free rescue ride from the passenger's current GPS to the original destination.
 */
async function findOrCreateActiveRescueRide(dbRunner, { passengerId, incident, origRide, pickupLat, pickupLng }) {
  const existRescue = await dbRunner.query(
    `SELECT * FROM rides
     WHERE (id = $1 OR (passenger_id = $2 AND is_free_rescue = true))
       AND status NOT IN ('COMPLETED', 'CANCELLED')
     ORDER BY created_at DESC LIMIT 1`,
    [incident?.rescue_ride_id || '', passengerId]
  );

  if (existRescue.rows.length > 0) {
    return existRescue.rows[0];
  }

  const rescueRideId = `ride-rescue-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const rescuePickupLat = pickupLat ?? incident?.current_lat ?? incident?.trigger_lat ?? origRide.pickup_latitude;
  const rescuePickupLng = pickupLng ?? incident?.current_lng ?? incident?.trigger_lng ?? origRide.pickup_longitude;
  const rescuePickupAddress = `🚨 Emergency Rescue Point (${Number(rescuePickupLat).toFixed(4)}, ${Number(rescuePickupLng).toFixed(4)})`;

  const rescueRideRes = await dbRunner.query(
    `INSERT INTO rides (
       id, passenger_id, pickup_address, pickup_latitude, pickup_longitude,
       destination_address, destination_latitude, destination_longitude,
       fare_amount, distance_km, status, is_free_rescue, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0.00, $9, 'REQUESTED', true, NOW(), NOW())
     RETURNING *`,
    [
      rescueRideId,
      passengerId,
      rescuePickupAddress,
      rescuePickupLat,
      rescuePickupLng,
      origRide.destination_address,
      origRide.destination_latitude,
      origRide.destination_longitude,
      origRide.distance_km || 5.0,
    ]
  );
  return rescueRideRes.rows[0];
}

/**
 * Dispatch the nearest available driver if the rescue ride is still awaiting assignment,
 * and return the hydrated ride record with joined driver details.
 */
async function dispatchAndLoadRescueRide(rescueRide) {
  if (!rescueRide?.id) return { rescueRide, dispatchResult: null };

  let dispatchResult = null;
  let hydratedRide = rescueRide;

  if (['REQUESTED', 'PENDING'].includes(rescueRide.status)) {
    logger.info({ rescueRideId: rescueRide.id }, 'Initiating automated nearest driver dispatch for rescue cab');
    dispatchResult = await dispatchRide(rescueRide.id);
    if (dispatchResult?.ride) {
      hydratedRide = dispatchResult.ride;
    }
  }

  if (!hydratedRide.driver_name || ['REQUESTED', 'PENDING'].includes(hydratedRide.status)) {
    const fullRescueRes = await query(
      `SELECT r.*, u.name as driver_name, u.phone as driver_phone, d.vehicle_model, d.license_plate, d.rating as driver_rating
       FROM rides r
       LEFT JOIN drivers d ON r.driver_id = d.id
       LEFT JOIN users u ON d.user_id = u.id
       WHERE r.id = $1`,
      [rescueRide.id]
    );
    if (fullRescueRes.rows.length > 0) {
      hydratedRide = fullRescueRes.rows[0];
    }
  }

  return { rescueRide: hydratedRide, dispatchResult };
}

/**
 * Clear suspended driver from Redis geospatial index/caches and force-logout their active terminal.
 */
async function purgeSuspendedDriverArtifacts(driverId, drvUserId = null) {
  if (!driverId) return;
  try {
    const rClient = getRedisClient();
    if (rClient) {
      await rClient.zrem('drivers:geo', driverId);
      await invalidateKey(`cache:drivers:profile:${driverId}`);
      await invalidatePattern('cache:drivers:*');
    }
  } catch (e) {
    logger.warn(e, 'Failed to clear suspended driver from Redis cache');
  }

  const payload = {
    driverId,
    userId: drvUserId,
    reason: 'Emergency passenger safety report triggered. Driver account has been terminated and removed from the system.',
  };
  publishRealtimeEvent(`driver:${drvUserId || driverId}`, 'driver:suspended:sos', payload);
  if (drvUserId) {
    publishRealtimeEvent(`user:${drvUserId}`, 'driver:suspended:sos', payload);
  }
  if (driverId && driverId !== drvUserId) {
    publishRealtimeEvent(`driver:${driverId}`, 'driver:suspended:sos', payload);
  }
}

/**
 * POST /api/v1/sos/trigger
 * Trigger an In-Ride Passenger Emergency SOS
 */
router.post('/trigger', async (req, res) => {
  const { ride_id, passenger_id, lat, lng } = req.body || {};

  if (!ride_id) {
    return res.status(400).json({ success: false, error: 'ValidationError', message: 'ride_id is required' });
  }

  const triggerLat = lat !== undefined ? parseFloat(lat) : 23.0233;
  const triggerLng = lng !== undefined ? parseFloat(lng) : 72.6006;
  const incidentId = `sos-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  logger.warn(
    { ride_id, passenger_id, lat: triggerLat, lng: triggerLng },
    '🚨 [EMERGENCY SOS TRIGGERED] In-ride SOS initiated by passenger!'
  );

  if (isDbConnected()) {
    try {
      // 1. Fetch complete context: Ride, Passenger, Driver
      const rideRes = await query(
        `SELECT r.*,
                p.user_id as pass_user_id, pu.name as passenger_name, pu.phone as passenger_phone, pu.email as passenger_email,
                d.user_id as driver_user_id, du.name as driver_name, du.phone as driver_phone, d.vehicle_model, d.license_plate
         FROM rides r
         JOIN passengers p ON r.passenger_id = p.id
         JOIN users pu ON p.user_id = pu.id
         LEFT JOIN drivers d ON r.driver_id = d.id
         LEFT JOIN users du ON d.user_id = du.id
         WHERE r.id = $1`,
        [ride_id]
      );

      if (rideRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
      }

      const rideContext = rideRes.rows[0];
      const actualPassengerId = rideContext.passenger_id;
      const actualDriverId = rideContext.driver_id;

      // Check if active incident already exists for this ride
      const existingRes = await query(
        `SELECT * FROM sos_incidents WHERE ride_id = $1 AND status = 'ACTIVE' LIMIT 1`,
        [ride_id]
      );

      let incident;
      if (existingRes.rows.length > 0) {
        incident = existingRes.rows[0];
        // Update current location
        await query(
          `UPDATE sos_incidents SET current_lat = $1, current_lng = $2, updated_at = NOW() WHERE incident_id = $3`,
          [triggerLat, triggerLng, incident.incident_id]
        );
      } else {
        const insertRes = await query(
          `INSERT INTO sos_incidents (
             incident_id, ride_id, passenger_id, driver_id,
             trigger_timestamp, trigger_lat, trigger_lng, current_lat, current_lng, status,
             flagged_driver_name, flagged_driver_phone, flagged_vehicle_model, flagged_license_plate
           ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $5, $6, 'ACTIVE', $7, $8, $9, $10)
           RETURNING *`,
          [
            incidentId,
            ride_id,
            actualPassengerId,
            actualDriverId,
            triggerLat,
            triggerLng,
            rideContext.driver_name || 'Suspended Driver',
            rideContext.driver_phone || 'N/A',
            rideContext.vehicle_model || 'Vehicle De-registered',
            rideContext.license_plate || 'De-registered',
          ]
        );
        incident = insertRes.rows[0];
      }

      // 1. Immediately abort active ride due to emergency SOS
      await query(
        `UPDATE rides 
         SET status = 'ABORTED_SOS', cancellation_reason = 'EMERGENCY_SOS_TRIGGERED', updated_at = NOW() 
         WHERE id = $1`,
        [ride_id]
      );

      // 2. Snapshot & immediately remove offending driver from database
      if (actualDriverId) {
        await query('DELETE FROM drivers WHERE id = $1', [actualDriverId]);
        if (rideContext.driver_user_id) {
          await query('DELETE FROM users WHERE id = $1', [rideContext.driver_user_id]);
        }
        await purgeSuspendedDriverArtifacts(actualDriverId, rideContext.driver_user_id);
      }

      // 3. Immediately Create Free Rescue Ride & Automatically Dispatch Nearest Driver
      let rescueRide = await findOrCreateActiveRescueRide(
        { query },
        {
          passengerId: actualPassengerId,
          incident,
          origRide: rideContext,
          pickupLat: triggerLat,
          pickupLng: triggerLng,
        }
      );
      const rescueRideId = rescueRide?.id || null;

      // Link rescue ride to incident
      await query(
        `UPDATE sos_incidents 
         SET rescue_ride_id = $1, admin_action_taken = 'DRIVER_SUSPENDED_RESCUE_DISPATCHED', updated_at = NOW() 
         WHERE incident_id = $2`,
        [rescueRideId, incident.incident_id]
      );

      // Auto-dispatch nearest available driver
      const { rescueRide: dispatchedRescue, dispatchResult } = await dispatchAndLoadRescueRide(rescueRide);
      rescueRide = dispatchedRescue;

      const simulatedAlertText = 'Simulated alert dispatched to Emergency Contacts & Local Authorities API.';
      logger.warn(
        { incidentId: incident.incident_id, passenger: rideContext.passenger_name },
        `🚨 [SIMULATED EMERGENCY DISPATCH] ${simulatedAlertText}`
      );

      // Realtime Broadcast to Admin Command Center
      const alertPayload = {
        incident_id: incident.incident_id,
        status: 'ACTIVE',
        trigger_timestamp: incident.trigger_timestamp,
        trigger_lat: triggerLat,
        trigger_lng: triggerLng,
        current_lat: triggerLat,
        current_lng: triggerLng,
        simulated_authority_alert: simulatedAlertText,
        passenger: {
          id: actualPassengerId,
          name: rideContext.passenger_name,
          phone: rideContext.passenger_phone,
          email: rideContext.passenger_email,
        },
        driver: {
          id: actualDriverId,
          name: rideContext.driver_name,
          phone: rideContext.driver_phone,
          vehicle_model: rideContext.vehicle_model,
          license_plate: rideContext.license_plate,
        },
        ride: {
          id: ride_id,
          pickup_address: rideContext.pickup_address,
          destination_address: rideContext.destination_address,
          fare_amount: rideContext.fare_amount,
          status: rideContext.status,
        },
        timestamp: new Date().toISOString(),
      };

      // Broadcast high-priority SOS alert events to Admin
      publishRealtimeEvent('admin:telemetry', 'NEW_SOS_ALERT', alertPayload);
      publishRealtimeEvent('admin:telemetry', 'sos:new_alert', alertPayload);

      // Notify passenger room
      publishRealtimeEvent(`user:${actualPassengerId}`, 'sos:triggered', {
        incident_id: incident.incident_id,
        status: 'ACTIVE',
        message: 'SOS Alert Sent – Admin Monitoring Live Location & Emergency Response Activated',
      });
      publishRealtimeEvent(`ride:${ride_id}`, 'sos:triggered', {
        incident_id: incident.incident_id,
        status: 'ACTIVE',
        message: 'SOS Alert Sent – Admin Monitoring Live Location',
      });

      // Broadcast rescue ride to passenger & admin
      if (rescueRideId) {
        const rescueEventPayload = {
          incident_id: incident.incident_id,
          passenger_id: actualPassengerId,
          passenger_user_id: rideContext.pass_user_id || null,
          rescueRideId,
          rescue_ride_id: rescueRideId,
          rescue_ride: rescueRide,
          ride: rescueRide,
          driver: dispatchResult?.driver || null,
          message: 'Driver suspended. A free rescue cab has been dispatched and assigned to your location.',
          dispatched: dispatchResult?.dispatched,
        };

        publishRealtimeEvent(`user:${actualPassengerId}`, 'sos:rescue:dispatched', rescueEventPayload);
        publishRealtimeEvent(`ride:${rescueRideId}`, 'ride:status:changed', {
          rideId: rescueRideId,
          status: rescueRide?.status || 'DRIVER_ASSIGNED',
          ride: rescueRide,
          driver: dispatchResult?.driver || null,
        });
        publishRealtimeEvent('admin:telemetry', 'sos:rescue_dispatched', rescueEventPayload);
      }

      return res.status(201).json({
        success: true,
        message: 'SOS emergency alert activated successfully. Operations Admin and authorities notified. Free rescue cab dispatched.',
        simulated_authority_alert: simulatedAlertText,
        simulated_external_alert: simulatedAlertText,
        data: {
          incident_id: incident.incident_id,
          status: incident.status,
          simulated_authority_alert: simulatedAlertText,
          simulated_external_alert: simulatedAlertText,
          incident,
          passenger: alertPayload.passenger,
          driver: alertPayload.driver,
          ride: alertPayload.ride,
          rescue_ride_id: rescueRideId,
          rescue_ride: rescueRide,
          driver_assigned: dispatchResult?.driver || null,
        },
      });
    } catch (err) {
      logger.error(err, 'PostgreSQL error triggering SOS incident');
    }
  }

  // In-Memory Fallback
  const memIncident = {
    incident_id: incidentId,
    ride_id,
    passenger_id: passenger_id || 'pass-seed-1',
    driver_id: 'driver-seed-1',
    trigger_timestamp: new Date().toISOString(),
    trigger_lat: triggerLat,
    trigger_lng: triggerLng,
    current_lat: triggerLat,
    current_lng: triggerLng,
    status: 'ACTIVE',
    admin_action_taken: null,
    resolved_at: null,
  };
  sosIncidentsStore.unshift(memIncident);

  const fallbackPayload = {
    incident_id: incidentId,
    status: 'ACTIVE',
    trigger_timestamp: memIncident.trigger_timestamp,
    trigger_lat: triggerLat,
    trigger_lng: triggerLng,
    current_lat: triggerLat,
    current_lng: triggerLng,
    simulated_authority_alert: 'Simulated alert dispatched to Emergency Contacts & Local Authorities API.',
    passenger: { name: 'Passenger', phone: '+91 98250 12345' },
    driver: { name: 'Assigned Driver', vehicle_model: 'Toyota Prius', license_plate: 'GJ-01-AB-1234' },
    ride: { id: ride_id, pickup_address: 'Ahmedabad', destination_address: 'Destination', status: 'IN_PROGRESS' },
  };

  publishRealtimeEvent('admin:telemetry', 'NEW_SOS_ALERT', fallbackPayload);

  res.status(201).json({
    success: true,
    message: 'SOS emergency alert activated successfully (InMemory).',
    simulated_authority_alert: fallbackPayload.simulated_authority_alert,
    data: fallbackPayload,
  });
});

/**
 * POST /api/v1/sos/:incidentId/location
 * Stream live passenger GPS updates during an active SOS emergency
 */
router.post('/:incidentId/location', async (req, res) => {
  const { incidentId } = req.params;
  const { lat, lng } = req.body || {};

  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ success: false, error: 'ValidationError', message: 'lat and lng required' });
  }

  const currentLat = parseFloat(lat);
  const currentLng = parseFloat(lng);

  if (isDbConnected()) {
    try {
      await query(
        `UPDATE sos_incidents 
         SET current_lat = $1, current_lng = $2, updated_at = NOW() 
         WHERE incident_id = $3`,
        [currentLat, currentLng, incidentId]
      );
    } catch (err) {
      logger.error(err, 'Error updating SOS live location');
    }
  }

  const memInc = sosIncidentsStore.find(i => i.incident_id === incidentId);
  if (memInc) {
    memInc.current_lat = currentLat;
    memInc.current_lng = currentLng;
  }

  // Stream live coordinates to Admin Command Center
  publishRealtimeEvent('admin:telemetry', 'sos:live_location', {
    incident_id: incidentId,
    lat: currentLat,
    lng: currentLng,
    timestamp: new Date().toISOString(),
  });

  res.json({
    success: true,
    incident_id: incidentId,
    lat: currentLat,
    lng: currentLng,
    data: {
      incident_id: incidentId,
      current_lat: currentLat,
      current_lng: currentLng,
      lat: currentLat,
      lng: currentLng,
    },
  });
});

/**
 * GET /api/v1/sos/incidents (or GET /api/v1/admin/sos/incidents)
 * Fetch all SOS incidents for the Admin Command Sentinel
 */
router.get('/incidents', async (req, res) => {
  if (isDbConnected()) {
    try {
      const result = await query(
        `SELECT s.*,
                pu.name as passenger_name, pu.phone as passenger_phone, pu.email as passenger_email,
                COALESCE(du.name, s.flagged_driver_name, 'Suspended Driver (Removed)') as driver_name,
                COALESCE(du.phone, s.flagged_driver_phone, 'N/A') as driver_phone,
                COALESCE(d.vehicle_model, s.flagged_vehicle_model, 'Vehicle De-registered') as vehicle_model,
                COALESCE(d.license_plate, s.flagged_license_plate, 'De-registered') as license_plate,
                r.pickup_address, r.destination_address, r.status as ride_status, r.fare_amount,
                rr.id as rescue_ride_id, rr.status as rescue_status, rrd_u.name as rescue_driver_name
         FROM sos_incidents s
         JOIN rides r ON s.ride_id = r.id
         JOIN passengers p ON s.passenger_id = p.id
         JOIN users pu ON p.user_id = pu.id
         LEFT JOIN drivers d ON s.driver_id = d.id
         LEFT JOIN users du ON d.user_id = du.id
         LEFT JOIN rides rr ON s.rescue_ride_id = rr.id
         LEFT JOIN drivers rrd_drv ON rr.driver_id = rrd_drv.id
         LEFT JOIN users rrd_u ON rrd_drv.user_id = rrd_u.id
         ORDER BY s.trigger_timestamp DESC
         LIMIT 50`
      );

      return res.json({
        success: true,
        source: 'PostgreSQL',
        total: result.rowCount,
        data: result.rows,
      });
    } catch (err) {
      logger.error(err, 'PostgreSQL error fetching SOS incidents');
    }
  }

  res.json({
    success: true,
    source: 'InMemoryStore',
    total: sosIncidentsStore.length,
    data: sosIncidentsStore,
  });
});

/**
 * POST /api/v1/admin/sos/:incidentId/suspend-driver
 * Admin Action: Abort ride immediately and suspend driver account
 */
router.post('/:incidentId/suspend-driver', async (req, res) => {
  const { incidentId } = req.params;

  logger.warn({ incidentId }, '🛑 Admin executing: Abort Ride & Suspend Driver');

  if (isDbConnected()) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const incRes = await client.query('SELECT * FROM sos_incidents WHERE incident_id = $1 FOR UPDATE', [incidentId]);
      if (incRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'NotFound', message: 'SOS Incident not found' });
      }

      const incident = incRes.rows[0];

      // 1. Abort Ride (Set status to ABORTED_SOS, prevent driver from charging or completing)
      await client.query(
        `UPDATE rides 
         SET status = 'ABORTED_SOS', cancellation_reason = 'EMERGENCY_SOS_ADMIN_ABORT', updated_at = NOW() 
         WHERE id = $1`,
        [incident.ride_id]
      );

      // 2. Snapshot driver details (preserving any previously captured snapshot) and IMMEDIATELY remove driver from database
      const origRideRes = await client.query('SELECT * FROM rides WHERE id = $1', [incident.ride_id]);
      const origRide = origRideRes.rows[0];
      const offendingDriverId = incident.driver_id || origRide?.driver_id;

      let drvUserId = null;
      if (offendingDriverId) {
        const drvRes = await client.query(
          `SELECT d.id, d.user_id, d.vehicle_model, d.license_plate, u.name as driver_name, u.phone as driver_phone
           FROM drivers d
           LEFT JOIN users u ON d.user_id = u.id
           WHERE d.id = $1`,
          [offendingDriverId]
        );
        if (drvRes.rows.length > 0) {
          const drvRow = drvRes.rows[0];
          drvUserId = drvRow.user_id;
          await client.query(
            `UPDATE sos_incidents 
             SET flagged_driver_name = COALESCE(flagged_driver_name, $1), 
                 flagged_driver_phone = COALESCE(flagged_driver_phone, $2), 
                 flagged_vehicle_model = COALESCE(flagged_vehicle_model, $3), 
                 flagged_license_plate = COALESCE(flagged_license_plate, $4) 
             WHERE incident_id = $5`,
            [
              drvRow.driver_name || 'Suspended Driver',
              drvRow.driver_phone || 'N/A',
              drvRow.vehicle_model || 'Vehicle De-registered',
              drvRow.license_plate || 'De-registered',
              incidentId,
            ]
          );

          await client.query('DELETE FROM drivers WHERE id = $1', [offendingDriverId]);
          if (drvUserId) {
            await client.query('DELETE FROM users WHERE id = $1', [drvUserId]);
          }
        }
      }

      // 3. Automated Rescue Ride Dispatch (Automatically find and allocate nearest driver)
      let rescueRide = null;
      let rescueRideId = incident.rescue_ride_id;
      let dispatchResult = null;

      if (origRide) {
        rescueRide = await findOrCreateActiveRescueRide(client, {
          passengerId: incident.passenger_id,
          incident,
          origRide,
        });
        rescueRideId = rescueRide?.id || null;
      }

      // 4. Update Incident Record and mark RESOLVED
      await client.query(
        `UPDATE sos_incidents 
         SET admin_action_taken = 'DRIVER_SUSPENDED_RESCUE_DISPATCHED', rescue_ride_id = $1, status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW() 
         WHERE incident_id = $2`,
        [rescueRideId, incidentId]
      );

      await client.query('COMMIT');

      // 5. Trigger automated nearest driver proximity dispatch for the rescue cab (if awaiting assignment)
      if (rescueRide) {
        const dispatched = await dispatchAndLoadRescueRide(rescueRide);
        rescueRide = dispatched.rescueRide;
        dispatchResult = dispatched.dispatchResult;
      }

      // Remove driver from Redis geo and memory
      await purgeSuspendedDriverArtifacts(offendingDriverId, drvUserId);

      publishRealtimeEvent(`ride:${incident.ride_id}`, 'ride:status:changed', {
        rideId: incident.ride_id,
        status: 'ABORTED_SOS',
        message: 'Ride has been aborted by System Operations due to an emergency SOS. Driver suspended.',
      });

      publishRealtimeEvent(`user:${incident.passenger_id}`, 'ride:status:changed', {
        rideId: incident.ride_id,
        status: 'ABORTED_SOS',
        message: 'Ride aborted. Emergency response team has suspended the driver.',
      });

      // Broadcast rescue ride to passenger
      const rescueEventPayload = {
        incident_id: incidentId,
        passenger_id: incident.passenger_id,
        rescueRideId,
        rescue_ride_id: rescueRideId,
        rescue_ride: rescueRide,
        ride: rescueRide,
        driver: dispatchResult?.driver || null,
        message: 'Driver suspended. A free rescue cab has been dispatched and assigned to your location.',
        dispatched: dispatchResult?.dispatched,
      };

      publishRealtimeEvent(`user:${incident.passenger_id}`, 'sos:rescue:dispatched', rescueEventPayload);
      publishRealtimeEvent(`ride:${rescueRideId}`, 'ride:status:changed', {
        rideId: rescueRideId,
        status: rescueRide?.status || 'DRIVER_ASSIGNED',
        ride: rescueRide,
        driver: dispatchResult?.driver || null,
      });

      publishRealtimeEvent('admin:telemetry', 'sos:driver_suspended', {
        incident_id: incidentId,
        driver_id: incident.driver_id,
        ride_id: incident.ride_id,
      });
      publishRealtimeEvent('admin:telemetry', 'sos:rescue_dispatched', rescueEventPayload);

      return res.json({
        success: true,
        message: 'Active ride aborted, driver suspended, and nearest rescue driver allocated to passenger.',
        data: {
          incident_id: incidentId,
          status: 'ABORTED_SOS',
          ride_status: 'ABORTED_SOS',
          driver_status: 'SUSPENDED_SOS',
          rescue_ride_id: rescueRideId,
          rescue_ride: rescueRide,
          driver: dispatchResult?.driver || null,
        },
      });
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      logger.error(err, 'PostgreSQL error suspending driver');
    } finally {
      if (client) client.release();
    }
  }

  // In-Memory Fallback
  const inc = sosIncidentsStore.find(i => i.incident_id === incidentId);
  if (inc) {
    inc.admin_action_taken = 'DRIVER_SUSPENDED_RIDE_ABORTED';
  }

  res.json({
    success: true,
    message: 'Active ride aborted and driver suspended (InMemory).',
    data: { incident_id: incidentId },
  });
});

/**
 * POST /api/v1/admin/sos/:incidentId/dispatch-rescue
 * Admin Action: Read passenger live GPS coordinates & dispatch a free rescue cab
 */
router.post('/:incidentId/dispatch-rescue', async (req, res) => {
  const { incidentId } = req.params;

  logger.warn({ incidentId }, '🚑 Admin executing: Dispatch Free Rescue Cab');

  if (isDbConnected()) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const incRes = await client.query('SELECT * FROM sos_incidents WHERE incident_id = $1 FOR UPDATE', [incidentId]);
      if (incRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'NotFound', message: 'SOS Incident not found' });
      }

      const incident = incRes.rows[0];

      // Ensure original ride is immediately aborted
      await client.query(
        `UPDATE rides 
         SET status = 'ABORTED_SOS', cancellation_reason = 'EMERGENCY_SOS_RESCUE_DISPATCHED', updated_at = NOW() 
         WHERE id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED', 'ABORTED_SOS')`,
        [incident.ride_id]
      );

      // Snapshot & delete offending driver immediately from database if still present
      let drvUserId = null;
      if (incident.driver_id) {
        const drvRes = await client.query(
          `SELECT d.id, d.user_id, d.vehicle_model, d.license_plate, u.name as driver_name, u.phone as driver_phone
           FROM drivers d
           LEFT JOIN users u ON d.user_id = u.id
           WHERE d.id = $1`,
          [incident.driver_id]
        );
        if (drvRes.rows.length > 0) {
          const drvRow = drvRes.rows[0];
          drvUserId = drvRow.user_id;
          await client.query(
            `UPDATE sos_incidents 
             SET flagged_driver_name = COALESCE(flagged_driver_name, $1), 
                 flagged_driver_phone = COALESCE(flagged_driver_phone, $2), 
                 flagged_vehicle_model = COALESCE(flagged_vehicle_model, $3), 
                 flagged_license_plate = COALESCE(flagged_license_plate, $4) 
             WHERE incident_id = $5`,
            [
              drvRow.driver_name || 'Suspended Driver',
              drvRow.driver_phone || 'N/A',
              drvRow.vehicle_model || 'Vehicle De-registered',
              drvRow.license_plate || 'De-registered',
              incidentId,
            ]
          );

          await client.query('DELETE FROM drivers WHERE id = $1', [incident.driver_id]);
          if (drvUserId) {
            await client.query('DELETE FROM users WHERE id = $1', [drvUserId]);
          }
        }
      }

      // Fetch original ride
      const origRideRes = await client.query('SELECT * FROM rides WHERE id = $1', [incident.ride_id]);
      if (origRideRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'NotFound', message: 'Original ride not found' });
      }
      const origRide = origRideRes.rows[0];

      // Find or create active free rescue ride (never reusing an old completed/cancelled one)
      let rescueRide = await findOrCreateActiveRescueRide(client, {
        passengerId: incident.passenger_id,
        incident,
        origRide,
      });
      const rescueRideId = rescueRide?.id || null;
      let dispatchResult = null;

      // Update incident with rescue ride ID & mark RESOLVED
      await client.query(
        `UPDATE sos_incidents 
         SET rescue_ride_id = $1, admin_action_taken = 'FREE_RESCUE_DISPATCHED', status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW() 
         WHERE incident_id = $2`,
        [rescueRideId, incidentId]
      );

      await client.query('COMMIT');

      // Clear driver from Redis geo and memory
      await purgeSuspendedDriverArtifacts(incident.driver_id, drvUserId);

      // Trigger automatic driver dispatch for the free rescue ride (if awaiting assignment)
      const dispatched = await dispatchAndLoadRescueRide(rescueRide);
      rescueRide = dispatched.rescueRide;
      dispatchResult = dispatched.dispatchResult;

      // Realtime alert to passenger
      const rescueEventPayload = {
        incident_id: incidentId,
        passenger_id: incident.passenger_id,
        rescueRideId,
        rescue_ride_id: rescueRideId,
        rescue_ride: rescueRide,
        ride: rescueRide,
        driver: dispatchResult?.driver || null,
        pickup_address: rescueRide?.pickup_address,
        destination_address: origRide.destination_address,
        fare: 0.00,
        is_free_rescue: true,
        message: 'A free rescue cab has been dispatched to your exact live GPS location.',
        dispatched: dispatchResult?.dispatched,
      };
      publishRealtimeEvent(`user:${incident.passenger_id}`, 'sos:rescue:dispatched', rescueEventPayload);

      publishRealtimeEvent('admin:telemetry', 'sos:rescue_dispatched', {
        incident_id: incidentId,
        rescueRideId,
        dispatched: dispatchResult?.dispatched,
      });

      return res.status(201).json({
        success: true,
        message: 'Free rescue cab successfully dispatched to passenger live GPS coordinates.',
        data: {
          incident_id: incidentId,
          rescue_ride_id: rescueRideId,
          rescue_ride: rescueRide,
          driver: dispatchResult?.driver || null,
          dispatched: dispatchResult?.dispatched,
        },
      });
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      logger.error(err, 'PostgreSQL error dispatching rescue cab');
    } finally {
      if (client) client.release();
    }
  }

  // In-Memory Fallback
  const rescueRideId = `ride-rescue-${Date.now()}`;
  res.status(201).json({
    success: true,
    message: 'Free rescue cab dispatched (InMemory).',
    data: { incident_id: incidentId, rescue_ride_id: rescueRideId },
  });
});

/**
 * POST /api/v1/admin/sos/:incidentId/resolve
 * Admin Action: Manually resolve incident and abort any uncompleted original SOS ride / flagged driver
 */
router.post('/:incidentId/resolve', async (req, res) => {
  const { incidentId } = req.params;

  if (isDbConnected()) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const incRes = await client.query('SELECT * FROM sos_incidents WHERE incident_id = $1 FOR UPDATE', [incidentId]);
      if (incRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'NotFound', message: 'SOS Incident not found' });
      }
      const incident = incRes.rows[0];

      // Abort the original flagged ride if it hasn't terminated yet
      if (incident.ride_id) {
        await client.query(
          `UPDATE rides 
           SET status = 'ABORTED_SOS', cancellation_reason = 'EMERGENCY_SOS_RESOLVED_BY_ADMIN', updated_at = NOW() 
           WHERE id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED', 'ABORTED_SOS')`,
          [incident.ride_id]
        );
      }

      // Ensure any still-linked offending driver is purged from DB
      let drvUserId = null;
      if (incident.driver_id) {
        const drvRes = await client.query('SELECT user_id FROM drivers WHERE id = $1', [incident.driver_id]);
        drvUserId = drvRes.rows[0]?.user_id || null;
        await client.query('DELETE FROM drivers WHERE id = $1', [incident.driver_id]);
        if (drvUserId) {
          await client.query('DELETE FROM users WHERE id = $1', [drvUserId]);
        }
      }

      await client.query(
        `UPDATE sos_incidents 
         SET status = 'RESOLVED', 
             admin_action_taken = COALESCE(admin_action_taken, 'ADMIN_RESOLVED_INCIDENT'), 
             resolved_at = COALESCE(resolved_at, NOW()), 
             updated_at = NOW() 
         WHERE incident_id = $1`,
        [incidentId]
      );

      await client.query('COMMIT');

      if (incident.driver_id) {
        await purgeSuspendedDriverArtifacts(incident.driver_id, drvUserId);
      }
      publishRealtimeEvent('admin:telemetry', 'sos:resolved', { incident_id: incidentId });

      return res.json({
        success: true,
        message: 'Incident resolved.',
        data: {
          incident_id: incidentId,
          status: 'RESOLVED',
          resolved_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      logger.error(err, 'Error resolving SOS incident');
      return res.status(500).json({ success: false, error: 'InternalServerError', message: err.message });
    } finally {
      if (client) client.release();
    }
  }

  const inc = sosIncidentsStore.find(i => i.incident_id === incidentId);
  if (inc) {
    inc.status = 'RESOLVED';
    inc.resolved_at = new Date().toISOString();
  }

  res.json({ success: true, message: 'Incident resolved (InMemory).' });
});

/**
 * POST /api/v1/sos/request-rescue
 * Passenger or System requests immediate rescue driver allocation for an aborted SOS ride
 */
router.post('/request-rescue', async (req, res) => {
  const { ride_id, passenger_id, lat, lng } = req.body || {};

  logger.warn({ ride_id, passenger_id }, '🚑 Requesting immediate nearest rescue driver allocation');

  if (isDbConnected()) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      // 1. Fetch the ride
      let targetRideId = ride_id;
      if (!targetRideId && passenger_id) {
        const latestRide = await client.query(
          'SELECT id FROM rides WHERE passenger_id = $1 ORDER BY created_at DESC LIMIT 1',
          [passenger_id]
        );
        if (latestRide.rows.length > 0) targetRideId = latestRide.rows[0].id;
      }

      if (!targetRideId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'ValidationError', message: 'ride_id or passenger_id required' });
      }

      const rideRes = await client.query('SELECT * FROM rides WHERE id = $1', [targetRideId]);
      if (rideRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
      }
      const origRide = rideRes.rows[0];

      // 1. Fetch associated incident first (before referencing it!)
      const incRes = await client.query(
        'SELECT * FROM sos_incidents WHERE ride_id = $1 OR passenger_id = $2 ORDER BY created_at DESC LIMIT 1',
        [targetRideId, origRide.passenger_id]
      );
      const incident = incRes.rows[0] || null;

      // 2. Abort original ride immediately
      await client.query(
        `UPDATE rides 
         SET status = 'ABORTED_SOS', cancellation_reason = 'EMERGENCY_SOS_RESCUE_REQUESTED', updated_at = NOW() 
         WHERE id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED', 'ABORTED_SOS')`,
        [origRide.id]
      );

      // 3. Snapshot & delete offending driver immediately from database if still present
      let drvUserId = null;
      const offendingDriverId = origRide.driver_id || incident?.driver_id;
      if (offendingDriverId) {
        const drvRes = await client.query(
          `SELECT d.id, d.user_id, d.vehicle_model, d.license_plate, u.name as driver_name, u.phone as driver_phone
           FROM drivers d
           LEFT JOIN users u ON d.user_id = u.id
           WHERE d.id = $1`,
          [offendingDriverId]
        );
        if (drvRes.rows.length > 0) {
          const drvRow = drvRes.rows[0];
          drvUserId = drvRow.user_id;
          if (incident) {
            await client.query(
              `UPDATE sos_incidents 
               SET flagged_driver_name = COALESCE(flagged_driver_name, $1), 
                   flagged_driver_phone = COALESCE(flagged_driver_phone, $2), 
                   flagged_vehicle_model = COALESCE(flagged_vehicle_model, $3), 
                   flagged_license_plate = COALESCE(flagged_license_plate, $4) 
               WHERE incident_id = $5`,
              [
                drvRow.driver_name || 'Suspended Driver',
                drvRow.driver_phone || 'N/A',
                drvRow.vehicle_model || 'Vehicle De-registered',
                drvRow.license_plate || 'De-registered',
                incident.incident_id,
              ]
            );
          }
          await client.query('DELETE FROM drivers WHERE id = $1', [offendingDriverId]);
          if (drvUserId) {
            await client.query('DELETE FROM users WHERE id = $1', [drvUserId]);
          }
        }
      }

      // 4. Find active rescue ride or create a fresh one (never reuse an old completed/cancelled rescue ride)
      const rescuePickupLat = lat !== undefined ? parseFloat(lat) : undefined;
      const rescuePickupLng = lng !== undefined ? parseFloat(lng) : undefined;
      let rescueRide = await findOrCreateActiveRescueRide(client, {
        passengerId: origRide.passenger_id,
        incident,
        origRide,
        pickupLat: rescuePickupLat,
        pickupLng: rescuePickupLng,
      });
      const rescueRideId = rescueRide.id;

      if (incident && incident.ride_id === origRide.id) {
        await client.query(
          `UPDATE sos_incidents 
           SET rescue_ride_id = $1, admin_action_taken = 'RESCUE_DISPATCHED_TO_PASSENGER', updated_at = NOW() 
           WHERE incident_id = $2`,
          [rescueRideId, incident.incident_id]
        );
      }

      await client.query('COMMIT');

      // Clear driver from Redis geo and memory
      await purgeSuspendedDriverArtifacts(offendingDriverId, drvUserId);

      // 5. Dispatch nearest available driver if still awaiting assignment
      const dispatched = await dispatchAndLoadRescueRide(rescueRide);
      rescueRide = dispatched.rescueRide;
      const dispatchResult = dispatched.dispatchResult;

      // Realtime Events
      const rescueEventPayload = {
        incident_id: incident?.incident_id || null,
        passenger_id: origRide.passenger_id,
        rescueRideId,
        rescue_ride_id: rescueRideId,
        rescue_ride: rescueRide,
        ride: rescueRide,
        driver: dispatchResult?.driver || null,
        message: 'A free rescue cab has been allocated and dispatched to your emergency location.',
        dispatched: dispatchResult?.dispatched,
      };

      publishRealtimeEvent(`user:${origRide.passenger_id}`, 'sos:rescue:dispatched', rescueEventPayload);
      publishRealtimeEvent(`ride:${rescueRideId}`, 'ride:status:changed', {
        rideId: rescueRideId,
        status: rescueRide.status,
        ride: rescueRide,
        driver: dispatchResult?.driver || null,
      });
      publishRealtimeEvent('admin:telemetry', 'sos:rescue_dispatched', rescueEventPayload);

      return res.status(201).json({
        success: true,
        message: 'Nearest rescue driver successfully allocated and dispatched.',
        data: {
          rescue_ride_id: rescueRideId,
          rescue_ride: rescueRide,
          driver: dispatchResult?.driver || null,
          dispatched: dispatchResult?.dispatched,
        },
      });
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      logger.error(err, 'Error in POST /api/v1/sos/request-rescue');
      return res.status(500).json({ success: false, error: 'InternalServerError', message: err.message });
    } finally {
      if (client) client.release();
    }
  }

  res.status(201).json({ success: true, message: 'Rescue cab dispatched (InMemory).' });
});

export default router;
