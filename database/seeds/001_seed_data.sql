-- ====================================================================
-- RIDEFLOW DISTRIBUTED SYSTEM: SEED DATA (AHMEDABAD LOCALIZATION)
-- Seed: 001_seed_data.sql
-- ====================================================================

-- 1. Insert Initial Users with Valid Bcrypt Hashes
-- admin@rideflow.io / admin123
-- passenger@rideflow.io / pass123
-- driver@rideflow.io / driver123
INSERT INTO users (id, email, password_hash, role, name, phone)
VALUES 
    ('user-admin-1', 'admin@rideflow.io', '$2b$10$ENA5lN.l4PfQHtJgFcksQOCiovkOg9B/ly0rLxcuc5wUMjxJzNMyq', 'ADMIN', 'System Administrator', '+91 90000 00001'),
    ('user-pass-1', 'passenger@rideflow.io', '$2b$10$58YTAfkN18YVW/jiwHQcqu2N.H8dHTdxpIdkYQI8lytaxn1ZwsRnm', 'PASSENGER', 'Aarav Patel', '+91 98250 12345'),
    ('user-pass-2', 'neha@rideflow.io', '$2b$10$58YTAfkN18YVW/jiwHQcqu2N.H8dHTdxpIdkYQI8lytaxn1ZwsRnm', 'PASSENGER', 'Neha Shah', '+91 98250 54321'),
    ('user-drv-1', 'driver@rideflow.io', '$2b$10$WPzWdSMqa2CO55rtPodcne6TXYJVUS7GoeCzIPUjJ1Lu1OLNIwksy', 'DRIVER', 'Rajesh Prajapati', '+91 98980 11223'),
    ('user-drv-2', 'driver2@rideflow.io', '$2b$10$WPzWdSMqa2CO55rtPodcne6TXYJVUS7GoeCzIPUjJ1Lu1OLNIwksy', 'DRIVER', 'Priya Desai', '+91 98980 44556'),
    ('user-drv-3', 'driver3@rideflow.io', '$2b$10$WPzWdSMqa2CO55rtPodcne6TXYJVUS7GoeCzIPUjJ1Lu1OLNIwksy', 'DRIVER', 'Amit Mehta', '+91 98980 77889'),
    ('user-drv-4', 'driver4@rideflow.io', '$2b$10$WPzWdSMqa2CO55rtPodcne6TXYJVUS7GoeCzIPUjJ1Lu1OLNIwksy', 'DRIVER', 'Suresh Solanki', '+91 98980 99001'),
    ('user-drv-5', 'driver5@rideflow.io', '$2b$10$WPzWdSMqa2CO55rtPodcne6TXYJVUS7GoeCzIPUjJ1Lu1OLNIwksy', 'DRIVER', 'Deepak Joshi', '+91 98980 22334')
ON CONFLICT (id) DO UPDATE SET 
    email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    name = EXCLUDED.name,
    phone = EXCLUDED.phone;

-- 2. Insert Passengers
INSERT INTO passengers (id, user_id, rating, total_rides)
VALUES 
    ('pass-seed-1', 'user-pass-1', 4.90, 0),
    ('pass-seed-2', 'user-pass-2', 4.85, 0)
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Drivers with Realistic Simulated GPS Coordinates in Ahmedabad, Gujarat
INSERT INTO drivers (id, user_id, vehicle_model, license_plate, rating, status, current_latitude, current_longitude, heading)
VALUES 
    ('driver-seed-1', 'user-drv-1', 'Toyota Prius (White)', 'GJ-01-AB-1234', 4.85, 'AVAILABLE', 23.0275, 72.5076, 90),
    ('driver-seed-2', 'user-drv-2', 'Hyundai Verna (Silver)', 'GJ-01-CD-5678', 4.92, 'AVAILABLE', 23.0373, 72.5303, 180),
    ('driver-seed-3', 'user-drv-3', 'Honda City (Black)', 'GJ-01-EF-9012', 4.70, 'OFFLINE', 23.0372, 72.5613, 0),
    ('driver-seed-4', 'user-drv-4', 'Maruti Dzire (White)', 'GJ-27-GH-3456', 4.88, 'AVAILABLE', 23.0338, 72.5714, 270),
    ('driver-seed-5', 'user-drv-5', 'Tata Nexon EV (Teal)', 'GJ-01-IJ-7890', 4.95, 'AVAILABLE', 23.0734, 72.6266, 45)
ON CONFLICT (id) DO UPDATE SET
    vehicle_model = EXCLUDED.vehicle_model,
    license_plate = EXCLUDED.license_plate,
    current_latitude = EXCLUDED.current_latitude,
    current_longitude = EXCLUDED.current_longitude,
    heading = EXCLUDED.heading;

-- 4. Insert Sample Historical Rides in Ahmedabad
INSERT INTO rides (id, passenger_id, driver_id, status, pickup_address, pickup_latitude, pickup_longitude, destination_address, destination_latitude, destination_longitude, fare_amount, distance_km)
VALUES 
    ('ride-seed-1', 'pass-seed-1', 'driver-seed-1', 'COMPLETED', 'SG Highway (Iscon Cross Road)', 23.0275, 72.5076, 'Navrangpura (CG Road)', 23.0372, 72.5613, 165.00, 5.80),
    ('ride-seed-2', 'pass-seed-2', 'driver-seed-2', 'COMPLETED', 'Vastrapur Lake / AlphaOne', 23.0373, 72.5303, 'SVP International Airport (SVPIA)', 23.0734, 72.6266, 280.00, 12.40)
ON CONFLICT (id) DO UPDATE SET
    pickup_address = EXCLUDED.pickup_address,
    pickup_latitude = EXCLUDED.pickup_latitude,
    pickup_longitude = EXCLUDED.pickup_longitude,
    destination_address = EXCLUDED.destination_address,
    destination_latitude = EXCLUDED.destination_latitude,
    destination_longitude = EXCLUDED.destination_longitude,
    fare_amount = EXCLUDED.fare_amount,
    distance_km = EXCLUDED.distance_km;

-- 5. Insert Sample Outbox Event
INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
VALUES 
    ('outbox-seed-1', 'RIDE', 'ride-seed-1', 'TRIP_COMPLETED', '{"ride_id": "ride-seed-1", "passenger_id": "pass-seed-1", "driver_id": "driver-seed-1", "amount": 165.00}', 'PUBLISHED')
ON CONFLICT (id) DO NOTHING;
