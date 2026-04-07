-- ============================================
-- 予約管理テーブル (reservations)
-- Supabase SQL Editor で実行してください
-- ============================================

CREATE TABLE IF NOT EXISTS reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_date TIMESTAMPTZ,        -- 登録日 (A列)
  appointment_date TIMESTAMPTZ,         -- 予約日時 (B列)
  name TEXT NOT NULL,                   -- 名前 (C列)
  treatment TEXT,                       -- 施術 (D列)
  clinic TEXT,                          -- クリニック (E列)
  email TEXT,                           -- メールアドレス (F列)
  phone TEXT,                           -- 連絡先 (G列)
  promotion TEXT,                       -- プロモーション (H列)
  pre_cancel TEXT,                      -- 事前キャンセル (I列) GASから自動
  visited TEXT,                         -- 来院有無 (J列) Webアプリから入力
  contracted TEXT,                      -- 成約有無 (K列) Webアプリから入力
  contract_amount INTEGER,              -- 成約金額 Webアプリから入力
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 重複防止用ユニーク制約（名前+予約日時）
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_unique
  ON reservations (name, appointment_date);

-- 更新日時の自動更新
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS (Row Level Security) を有効にして anon アクセスを許可
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON reservations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_reservations_appointment ON reservations (appointment_date DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_clinic ON reservations (clinic);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations (visited, contracted);
