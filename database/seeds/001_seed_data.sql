-- ====================================================================
-- RIDEFLOW DISTRIBUTED SYSTEM: SEED DATA
-- Seed: 001_seed_data.sql
-- ====================================================================

-- 1. Insert Initial Users with Valid Bcrypt Hashes
-- admin@rideflow.io / admin123
-- passenger@rideflow.io / pass123
-- driver@rideflow.io / driver123
INSERT INTO users (id, email, password_hash, role, name, phone)
VALUES 
    ('user-admin-1', 'admin@rideflow.io', '$2b$10$ENA5lN.l4PfQHtJgFcksQOCiovkOg9B/ly0rLxcuc5wUMjxJzNMyq', 'ADMIN', 'System Administrator', '+91 90000 00001'),
    ('user-pass-1', 'passenger@rideflow.io', '$2b$10$58YTAfkN18YVW/jiwHQcqu2N.H8dHTdxpIdkYQI8lytaxn1ZwsRnm', 'PASSENGER', 'Aarav Sharma', '+91 91234 56789'),
    ('user-pass-2', 'neha@rideflow.io', '$2b$10$58YTAfkN18YVW/jiwHQcqu2N.H8dHTdxpIdkYQI8lytaxn1ZwsRnm', 'PASSENGER', 'Neha Patel', '+91 91234 56790'),
    ('user-drv-1', 'driver@rideflow.io', '$2b$10$WPzWdSMqa2CO55rtPodcne6TXYJVUS7GoeCzIPUjJ1Lu1OLNIwksy', 'DRIVER', 'Rajesh Kumar', '+91 98765 43210'),
    ('user-drv-2', 'driver2@rideflow.io', '$2b$10$WPzWdSMqa2CO55rtPodcne6TXYJVUS7GoeCzIPUjJ1Lu1OLNIwksy', 'DRIVER', 'Priya Sharma', '+91 98765 43211'),
    ('user-drv-3', 'driver3@rideflow.io', '$2b$10$WPzWdSMqa2CO55rtPodcne6TXYJVUS7GoeCzIPUjJ1Lu1OLNIwksy', 'DRIVER', 'Amit Verma', '+91 98765 43212'),
    ('user-drv-4', 'driver4@rideflow.io', '$2b$10$WPzWdSMqa2CO55rtPodcne6TXYJVUS7GoeCzIPUjJ1Lu1OLNIwksy', 'DRIVER', 'Suresh Nair', '+91 98765 43213'),
    ('user-drv-5', 'driver5@rideflow.io', '$2b$10$WPzWdSMqa2CO55rtPodcne6TXYJVUS7GoeCzIPUjJ1Lu1OLNIwksy', 'DRIVER', 'Deepak Joshi', '+91 98765 43214')
ON CONFLICT (id) DO UPDATE SET 
    email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    name = EXCLUDED.name,
    phone = EXCLUDED.phone;

-- 2. Insert Passengers
INSERT INTO passengers (id, user_id, rating, total_rides)
VALUES 
    ('pass-seed-1', 'user-pass-1', 4.90, 18),
    ('pass-seed-2', 'user-pass-2', 4.85, 9)
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Drivers with Realistic Simulated GPS Coordinates
INSERT INTO drivers (id, user_id, vehicle_model, license_plate, rating, status, current_latitude, current_longitude, heading)
VALUES 
    ('driver-seed-1', 'user-drv-1', 'Toyota Prius (White)', 'KA-01-AB-1234', 4.85, 'AVAILABLE', 12.9719, 77.5937, 90),
    ('driver-seed-2', 'user-drv-2', 'Hyundai Verna (Silver)', 'KA-05-CD-5678', 4.92, 'AVAILABLE', 12.9780, 77.6010, 180),
    ('driver-seed-3', 'user-drv-3', 'Honda City (Black)', 'KA-03-EF-9012', 4.70, 'OFFLINE', 12.9350, 77.6240, 0),
    ('driver-seed-4', 'user-drv-4', 'Maruti Dzire (White)', 'KA-04-GH-3456', 4.88, 'AVAILABLE', 12.9650, 77.5850, 270),
    ('driver-seed-5', 'user-drv-5', 'Tata Nexon EV (Blue)', 'KA-02-IJ-7890', 4.95, 'AVAILABLE', 12.9820, 77.6150, 45)
ON CONFLICT (id) DO NOTHING;

-- 4. Insert Sample Historical Rides
INSERT INTO rides (id, passenger_id, driver_id, status, pickup_address, pickup_latitude, pickup_longitude, destination_address, destination_latitude, destination_longitude, fare_amount, distance_km)
VALUES 
    ('ride-seed-1', 'pass-seed-1', 'driver-seed-1', 'COMPLETED', 'Downtown Central Mall', 12.9716, 77.5946, 'Tech Innovation Park', 12.9352, 77.6245, 240.50, 6.20),
    ('ride-seed-2', 'pass-seed-2', 'driver-seed-2', 'COMPLETED', 'Indiranagar 100ft Road', 12.9784, 77.6408, 'MG Road Metro Station', 12.9750, 77.6080, 185.00, 4.10)
ON CONFLICT (id) DO NOTHING;

-- 5. Insert Sample Outbox Event
INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
VALUES 
    ('outbox-seed-1', 'RIDE', 'ride-seed-1', 'TRIP_COMPLETED', '{"ride_id": "ride-seed-1", "passenger_id": "pass-seed-1", "driver_id": "driver-seed-1", "amount": 240.50}', 'PUBLISHED')
ON CONFLICT (id) DO NOTHING;
