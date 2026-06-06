-- Koreksi absensi: jam tersimpan +7 jam (UTC/WIB) padahal seharusnya jam dinding WITA pagi

ALTER TABLE attendances
  MODIFY clock_in_at DATETIME NOT NULL,
  MODIFY clock_out_at DATETIME NULL;

-- Shift pagi/siang (masuk sebelum 11:00) yang tercatat siang (>=12:00) → mundur 7 jam
UPDATE attendances a
LEFT JOIN work_shifts ws ON ws.id = a.work_shift_id
SET
  a.clock_in_at = DATE_SUB(a.clock_in_at, INTERVAL 7 HOUR),
  a.clock_out_at = IF(a.clock_out_at IS NOT NULL, DATE_SUB(a.clock_out_at, INTERVAL 7 HOUR), NULL)
WHERE HOUR(a.clock_in_at) >= 12
  AND (ws.time_in IS NULL OR CAST(ws.time_in AS TIME) < '11:00:00');

-- Reset status telat yang salah akibat jam geser (shift pagi)
UPDATE attendances a
JOIN work_shifts ws ON ws.id = a.work_shift_id
SET
  a.late_minutes = GREATEST(
    0,
    TIMESTAMPDIFF(
      MINUTE,
      ADDTIME(DATE(a.clock_in_at), CAST(ws.time_in AS TIME)),
      a.clock_in_at
    ) - COALESCE(ws.grace_in_minutes, 0)
  ),
  a.status = IF(
    GREATEST(
      0,
      TIMESTAMPDIFF(
        MINUTE,
        ADDTIME(DATE(a.clock_in_at), CAST(ws.time_in AS TIME)),
        a.clock_in_at
      ) - COALESCE(ws.grace_in_minutes, 0)
    ) > 0,
    'telat',
    'hadir'
  )
WHERE CAST(ws.time_in AS TIME) < '11:00:00';
