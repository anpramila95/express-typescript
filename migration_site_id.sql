-- ===================================================================================
-- SCRIPT DI CƯ DỮ LIỆU ĐỂ HỖ TRỢ MULTI-SITE (PHIÊN BẢN HOÀN CHỈNH)
-- ===================================================================================
-- Ghi chú:
-- Script này đã được tối ưu để có thể chạy lại nhiều lần mà không gây lỗi.
-- Nó sẽ kiểm tra và chỉ thêm các cột/ràng buộc nếu chúng chưa tồn tại.
-- ===================================================================================

-- Sửa lỗi: Luôn xóa procedure cũ trước khi tạo lại để tránh lỗi "already exists"
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS migrate_subscription_plans;
DROP PROCEDURE IF EXISTS migrate_pricing_plans;
DROP PROCEDURE IF EXISTS CleanupOrphanData;

DELIMITER $$
CREATE PROCEDURE AddColumnIfNotExists(
    IN dbName VARCHAR(255),
    IN tableName VARCHAR(255),
    IN colName VARCHAR(255),
    IN colDef TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = dbName AND table_name = tableName AND column_name = colName
    ) THEN
        SET @sql = CONCAT('ALTER TABLE `', tableName, '` ', colDef);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

-- 1. Thêm `site_id` vào bảng `transactions`
CALL AddColumnIfNotExists(DATABASE(), 'transactions', 'site_id', 'ADD COLUMN site_id INT UNSIGNED NOT NULL DEFAULT 1, ADD INDEX idx_transactions_site_id (site_id), ADD CONSTRAINT fk_transactions_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE');

-- 2. Thêm `site_id` vào bảng `credit_packages`
CALL AddColumnIfNotExists(DATABASE(), 'credit_packages', 'site_id', 'ADD COLUMN site_id INT UNSIGNED NOT NULL DEFAULT 1, ADD INDEX idx_credit_packages_site_id (site_id), ADD CONSTRAINT fk_credit_packages_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE');

-- 3. Cập nhật bảng `subscription_plans`
DELIMITER $$
CREATE PROCEDURE migrate_subscription_plans()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'subscription_plans' AND column_name = 'site_id'
    ) THEN
        DROP TABLE IF EXISTS subscription_plans_backup;
        CREATE TABLE subscription_plans_backup AS SELECT * FROM subscription_plans;
        ALTER TABLE subscription_plans ADD COLUMN site_id INT UNSIGNED;
        UPDATE subscription_plans sp SET sp.site_id = (SELECT s.id FROM sites s WHERE s.user_id = sp.user_id LIMIT 1);
        ALTER TABLE subscription_plans MODIFY COLUMN site_id INT UNSIGNED NOT NULL, ADD INDEX idx_subscription_plans_site_id (site_id), ADD CONSTRAINT fk_subscription_plans_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
    END IF;
END$$
DELIMITER ;
CALL migrate_subscription_plans();
DROP PROCEDURE migrate_subscription_plans;

-- 4. Cập nhật bảng `pricing_plans` (Đã sửa lỗi `Data truncated`)
DELIMITER $$
CREATE PROCEDURE migrate_pricing_plans()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pricing_plans' AND column_name = 'site_id'
    ) THEN
        ALTER TABLE pricing_plans ADD COLUMN site_id INT UNSIGNED;
        UPDATE pricing_plans pp SET pp.site_id = IFNULL((SELECT sp.site_id FROM subscription_plans sp WHERE sp.id = pp.plan_id LIMIT 1), 1);
        ALTER TABLE pricing_plans MODIFY COLUMN site_id INT UNSIGNED NOT NULL, ADD INDEX idx_pricing_plans_site_id (site_id), ADD CONSTRAINT fk_pricing_plans_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
    END IF;
END$$
DELIMITER ;
CALL migrate_pricing_plans();
DROP PROCEDURE migrate_pricing_plans;

-- 5. Thêm `site_id` vào bảng `discount_codes`
CALL AddColumnIfNotExists(DATABASE(), 'discount_codes', 'site_id', 'ADD COLUMN site_id INT UNSIGNED NOT NULL DEFAULT 1, ADD INDEX idx_discount_codes_site_id (site_id), ADD CONSTRAINT fk_discount_codes_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE');

-- 6. Cập nhật dữ liệu `transactions`
UPDATE transactions t SET t.site_id = (SELECT s.id FROM users u JOIN sites s ON u.id = s.user_id WHERE u.id = t.user_id LIMIT 1) WHERE t.site_id = 1;

-- 7. Tạo các Indexes
DROP INDEX IF EXISTS idx_users_site_id ON users;
CREATE INDEX idx_users_site_id ON users(site_id);
DROP INDEX IF EXISTS idx_transactions_user_site ON transactions;
CREATE INDEX idx_transactions_user_site ON transactions(user_id, site_id);
DROP INDEX IF EXISTS idx_transactions_status_site ON transactions;
CREATE INDEX idx_transactions_status_site ON transactions(status, site_id);

-- 8. Tạo View thống kê
CREATE OR REPLACE VIEW v_site_statistics AS
SELECT s.id as site_id, s.domain, s.user_id as site_owner_id, COUNT(DISTINCT u.id) as total_users, COUNT(DISTINCT sp.id) as total_subscription_plans, COUNT(DISTINCT pp.id) as total_pricing_plans, COUNT(DISTINCT dc.id) as total_discount_codes, COUNT(DISTINCT t.id) as total_transactions, COUNT(DISTINCT CASE WHEN t.status = 'pending' THEN t.id END) as pending_transactions
FROM sites s
LEFT JOIN users u ON u.site_id = s.id
LEFT JOIN subscription_plans sp ON sp.site_id = s.id
LEFT JOIN pricing_plans pp ON pp.site_id = s.id
LEFT JOIN discount_codes dc ON dc.site_id = s.id
LEFT JOIN transactions t ON t.site_id = s.id
GROUP BY s.id, s.domain, s.user_id;

-- 9. Tạo Procedure dọn dẹp
DELIMITER $$
CREATE PROCEDURE CleanupOrphanData()
BEGIN
    DELETE t FROM transactions t LEFT JOIN users u ON u.id = t.user_id WHERE u.id IS NULL;
    DELETE pp FROM pricing_plans pp LEFT JOIN subscription_plans sp ON sp.id = pp.plan_id WHERE sp.id IS NULL;
    SELECT 'Cleanup completed' as status;
END$$
DELIMITER ;

-- 10. Chạy Procedure dọn dẹp
CALL CleanupOrphanData();
DROP PROCEDURE CleanupOrphanData;

-- Dọn dẹp thủ tục helper cuối cùng
DROP PROCEDURE AddColumnIfNotExists;

-- Thông báo hoàn thành
SELECT 'Migration script completed successfully.' as message;