-- ============================================================
-- Migration 00004 — Limites du bucket photos-jardins
-- ============================================================

UPDATE storage.buckets
SET file_size_limit = 3145728,
    allowed_mime_types = ARRAY['image/jpeg']
WHERE id = 'photos-jardins';
