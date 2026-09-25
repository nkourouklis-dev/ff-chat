-- Δείκτης για το ημερήσιο όριο μηνυμάτων ανά χρήστη
CREATE INDEX IF NOT EXISTS idx_messages_user_time ON messages(user_id, created_at);
