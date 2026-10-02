-- ===============================================================
-- 1 Barber Booking System - PostgreSQL / Supabase Schema
-- ===============================================================

-- 1. Xizmatlar jadvali
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(100) NOT NULL,
    price INT NOT NULL,
    duration_minutes INT NOT NULL, -- 30, 45, 60
    description TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Ish jadvali va tanaffuslar
-- day_of_week: 1=Dushanba, 2=Seshanba, ..., 7=Yakshanba
CREATE TABLE IF NOT EXISTS work_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_of_week INT NOT NULL UNIQUE CHECK (day_of_week BETWEEN 1 AND 7),
    is_working_day BOOLEAN DEFAULT TRUE,
    work_start TIME NOT NULL DEFAULT '09:00',
    work_end TIME NOT NULL DEFAULT '20:00',
    break_start TIME DEFAULT '13:00',
    break_end TIME DEFAULT '14:00'
);

-- Maxsus dam olish yoki ish vaqti o'zgargan kunlar uchun
CREATE TABLE IF NOT EXISTS special_off_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    off_date DATE UNIQUE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Bronlar (Buyurtmalar)
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name VARCHAR(100) NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    service_id UUID REFERENCES services(id) ON DELETE RESTRICT,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tezkor slot qidiruvi uchun indekslar (Overlap tekshiruvi tezlashishi uchun)
CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings (booking_date, status);
CREATE INDEX IF NOT EXISTS idx_bookings_times ON bookings (booking_date, start_time, end_time);

-- ===============================================================
-- Birlamchi ma'lumotlar (Boshlang'ich Seed ma'lumotlar)
-- ===============================================================

-- Standart xizmatlar
INSERT INTO services (title, price, duration_minutes, description, is_active) VALUES
('Soch olish (Klassik / Fentezi)', 60000, 30, 'Zamonaviy yoki klassik uslubdagi soch turmagi, yuvish va styling', true),
('Soqol tekislash va shakl berish', 40000, 30, 'Issiq sochiq, lezviya bilan qirqish va parvarish moyi', true),
('Combo: Soch + Soqol', 90000, 60, 'To‘liq tozalash, soch va soqol shakllantirish, yuz massaji', true),
('Bolalar sochi (10 yoshgacha)', 45000, 30, 'Bolalar uchun sabrli va ehtiyotkorona xizmat', true),
('VIP Royal Xizmat', 150000, 60, 'Soch, soqol, yuz qora niqobi, bosh massaji va premium styling', true)
ON CONFLICT DO NOTHING;

-- Haftaning 7 kuni uchun ish jadvali (Dushanbadan Shanbagacha ochiq, Yakshanba qisqa yoki dam)
INSERT INTO work_schedule (day_of_week, is_working_day, work_start, work_end, break_start, break_end) VALUES
(1, true, '09:00', '20:00', '13:00', '14:00'), -- Dushanba
(2, true, '09:00', '20:00', '13:00', '14:00'), -- Seshanba
(3, true, '09:00', '20:00', '13:00', '14:00'), -- Chorshanba
(4, true, '09:00', '20:00', '13:00', '14:00'), -- Payshanba
(5, true, '09:00', '20:00', '12:30', '14:00'), -- Juma (Juma namozi uchun tanaffus)
(6, true, '09:00', '21:00', '13:00', '14:00'), -- Shanba (uzaytirilgan ish vaqti)
(7, false, '10:00', '18:00', '13:00', '14:00') -- Yakshanba (Dam olish kuni)
ON CONFLICT (day_of_week) DO NOTHING;
