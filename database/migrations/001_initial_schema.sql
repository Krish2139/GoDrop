-- ====================================================================
-- RIDEFLOW DISTRIBUTED SYSTEM: INITIAL POSTGRESQL SCHEMA MIGRATION
-- Migration: 001_initial_schema.sql
-- Satisfies Academic System Design Requirements (Section 6)
-- ====================================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------
-- 1. USERS TABLE (Core Authentication & Role Management)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('PASSENGER', 'DRIVER', 'ADMIN')),
    name VARCHAR(128) NOT NULL,
    phone VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- --------------------------------------------------------------------
-- 2. PASSENGERS TABLE (Domain Passenger Profiles)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS passengers (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    rating NUMERIC(3, 2) NOT NULL DEFAULT 5.00 CHECK (rating >= 1.00 AND rating <= 5.00),
    total_ratings INTEGER NOT NULL DEFAULT 5,
    total_rides INTEGER NOT NULL DEFAULT 0 CHECK (total_rides >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passengers_user_id ON passengers(user_id);

-- --------------------------------------------------------------------
-- 3. DRIVERS TABLE (Domain Driver Availability & GPS Tracking)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    vehicle_model VARCHAR(128) NOT NULL,
    license_plate VARCHAR(64) NOT NULL UNIQUE,
    rating NUMERIC(3, 2) NOT NULL DEFAULT 5.00 CHECK (rating >= 1.00 AND rating <= 5.00),
    total_ratings INTEGER NOT NULL DEFAULT 5,
    status VARCHAR(32) NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('AVAILABLE', 'OFFLINE', 'RESERVED', 'ON_TRIP', 'SUSPENDED_SOS')),
    approval_status VARCHAR(32) NOT NULL DEFAULT 'APPROVED' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    current_latitude DOUBLE PRECISION NOT NULL,
    current_longitude DOUBLE PRECISION NOT NULL,
    heading INTEGER NOT NULL DEFAULT 0 CHECK (heading >= 0 AND heading <= 360),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers(current_latitude, current_longitude);

-- --------------------------------------------------------------------
-- 4. RIDES TABLE (Core Ride Lifecycle State Machine)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rides (
    id VARCHAR(64) PRIMARY KEY,
    passenger_id VARCHAR(64) NOT NULL REFERENCES passengers(id) ON DELETE RESTRICT,
    driver_id VARCHAR(64) REFERENCES drivers(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED' CHECK (
        status IN (
            'REQUESTED',
            'PENDING',
            'DRIVER_ASSIGNED',
            'DRIVER_ACCEPTED',
            'DRIVER_ARRIVED',
            'IN_PROGRESS',
            'COMPLETED',
            'CANCELLED',
            'ABORTED_SOS',
            'RESCUE_RIDE'
        )
    ),
    pickup_address VARCHAR(255) NOT NULL,
    pickup_latitude DOUBLE PRECISION NOT NULL,
    pickup_longitude DOUBLE PRECISION NOT NULL,
    destination_address VARCHAR(255) NOT NULL,
    destination_latitude DOUBLE PRECISION NOT NULL,
    destination_longitude DOUBLE PRECISION NOT NULL,
    fare_amount NUMERIC(10, 2) NOT NULL CHECK (fare_amount >= 0),
    distance_km NUMERIC(6, 2) CHECK (distance_km >= 0),
    is_free_rescue BOOLEAN NOT NULL DEFAULT false,
    cancellation_reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_passenger_id ON rides(passenger_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_created_at ON rides(created_at DESC);

-- --------------------------------------------------------------------
-- 5. RIDE_ASSIGNMENTS TABLE (Driver Dispatch Offer Tracking)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ride_assignments (
    id VARCHAR(64) PRIMARY KEY,
    ride_id VARCHAR(64) NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    driver_id VARCHAR(64) NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'OFFERED' CHECK (status IN ('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REVOKED')),
    distance_km NUMERIC(6, 2) NOT NULL,
    offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_ride ON ride_assignments(ride_id);
CREATE INDEX IF NOT EXISTS idx_assignments_driver ON ride_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON ride_assignments(status);

-- --------------------------------------------------------------------
-- 6. NOTIFICATIONS TABLE (Simulated Multi-Channel Alerts)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(32) NOT NULL CHECK (channel IN ('SMS', 'PUSH', 'EMAIL', 'SOCKET')),
    title VARCHAR(128) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

-- --------------------------------------------------------------------
-- 7. TASKS TABLE (Background Job Audit & Retry Registry)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(64) PRIMARY KEY,
    type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- --------------------------------------------------------------------
-- 8. OUTBOX_EVENTS TABLE (Transactional Outbox Pattern)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbox_events (
    id VARCHAR(64) PRIMARY KEY,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, created_at ASC);

-- --------------------------------------------------------------------
-- TRIGGER FOR AUTOMATIC updated_at TIMESTAMP REFRESH
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trg_passengers_updated_at ON passengers;
CREATE TRIGGER trg_passengers_updated_at
BEFORE UPDATE ON passengers
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trg_drivers_updated_at ON drivers;
CREATE TRIGGER trg_drivers_updated_at
BEFORE UPDATE ON drivers
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trg_rides_updated_at ON rides;
CREATE TRIGGER trg_rides_updated_at
BEFORE UPDATE ON rides
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- --------------------------------------------------------------------
-- 9. SOS_INCIDENTS TABLE (In-Ride Emergency Sentinel & Rescue Dispatch)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sos_incidents (
    incident_id VARCHAR(64) PRIMARY KEY,
    ride_id VARCHAR(64) NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    passenger_id VARCHAR(64) NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
    driver_id VARCHAR(64) REFERENCES drivers(id) ON DELETE SET NULL,
    trigger_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trigger_lat DOUBLE PRECISION NOT NULL,
    trigger_lng DOUBLE PRECISION NOT NULL,
    current_lat DOUBLE PRECISION,
    current_lng DOUBLE PRECISION,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESOLVED')),
    admin_action_taken VARCHAR(255),
    rescue_ride_id VARCHAR(64) REFERENCES rides(id) ON DELETE SET NULL,
    flagged_driver_name VARCHAR(128),
    flagged_driver_phone VARCHAR(32),
    flagged_vehicle_model VARCHAR(128),
    flagged_license_plate VARCHAR(64),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sos_ride ON sos_incidents(ride_id);
CREATE INDEX IF NOT EXISTS idx_sos_passenger ON sos_incidents(passenger_id);
CREATE INDEX IF NOT EXISTS idx_sos_status ON sos_incidents(status);

DROP TRIGGER IF EXISTS trg_sos_incidents_updated_at ON sos_incidents;
CREATE TRIGGER trg_sos_incidents_updated_at
BEFORE UPDATE ON sos_incidents
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

