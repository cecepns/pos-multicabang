-- Mini ATM: saldo cash/rekening per cabang + transaksi + audit

CREATE TABLE IF NOT EXISTS mini_atm_branch_balances (
  branch_id INT UNSIGNED NOT NULL PRIMARY KEY,
  cash_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  bank_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  default_admin_fee DECIMAL(14,2) NOT NULL DEFAULT 1450,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mini_atm_bb_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mini_atm_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  transaction_number VARCHAR(32) NOT NULL,
  transaction_type ENUM('tarik_tunai', 'transfer') NOT NULL,
  card_status ENUM('pakai_kartu', 'tanpa_kartu') NOT NULL,
  nominal DECIMAL(14,2) NOT NULL,
  admin_fee DECIMAL(14,2) NOT NULL DEFAULT 1450,
  admin_fee_type ENUM('potong_dalam', 'potong_luar') NOT NULL,
  opening_cash DECIMAL(14,2) NOT NULL,
  closing_cash DECIMAL(14,2) NOT NULL,
  opening_bank DECIMAL(14,2) NOT NULL,
  closing_bank DECIMAL(14,2) NOT NULL,
  cash_delta DECIMAL(14,2) NOT NULL DEFAULT 0,
  bank_delta DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  transaction_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_mini_atm_tx_number (transaction_number),
  INDEX idx_mini_atm_tx_branch_date (branch_id, transaction_at),
  INDEX idx_mini_atm_tx_type (transaction_type),
  INDEX idx_mini_atm_tx_card (card_status),
  CONSTRAINT fk_mini_atm_tx_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_mini_atm_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mini_atm_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  entity VARCHAR(32) NOT NULL DEFAULT 'mini_atm_transaction',
  entity_id BIGINT UNSIGNED NULL,
  action ENUM('create', 'update', 'delete') NOT NULL,
  old_data JSON NULL,
  new_data JSON NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mini_atm_audit_branch (branch_id, created_at),
  INDEX idx_mini_atm_audit_entity (entity, entity_id),
  CONSTRAINT fk_mini_atm_audit_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_mini_atm_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
