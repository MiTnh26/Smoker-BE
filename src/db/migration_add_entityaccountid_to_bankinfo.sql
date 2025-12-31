-- Migration: Thêm cột EntityAccountId vào bảng BankInfo
-- Chạy script này trước khi chạy migrate-bankinfo-to-entityaccountid.js

USE Smoker;
GO

-- Kiểm tra xem cột EntityAccountId đã tồn tại chưa
IF NOT EXISTS (
    SELECT * 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'BankInfo' 
    AND COLUMN_NAME = 'EntityAccountId'
)
BEGIN
    -- Thêm cột EntityAccountId (cho phép NULL tạm thời để migrate dữ liệu cũ)
    ALTER TABLE BankInfo
    ADD EntityAccountId UNIQUEIDENTIFIER NULL;
    
    PRINT '✅ Đã thêm cột EntityAccountId vào bảng BankInfo';
END
ELSE
BEGIN
    PRINT '⚠️ Cột EntityAccountId đã tồn tại trong bảng BankInfo';
END
GO

-- Kiểm tra xem constraint UNIQUE đã tồn tại chưa
IF NOT EXISTS (
    SELECT * 
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
    WHERE TABLE_NAME = 'BankInfo' 
    AND CONSTRAINT_NAME = 'UQ_BankInfo_Entity'
)
BEGIN
    -- Thêm UNIQUE constraint (chỉ khi đã migrate xong dữ liệu)
    -- Lưu ý: Chỉ chạy sau khi đã migrate tất cả dữ liệu cũ
    -- ALTER TABLE BankInfo
    -- ADD CONSTRAINT UQ_BankInfo_Entity UNIQUE (EntityAccountId);
    
    PRINT '⚠️ Chưa thêm UNIQUE constraint. Chạy sau khi migrate dữ liệu xong.';
END
ELSE
BEGIN
    PRINT '✅ Constraint UQ_BankInfo_Entity đã tồn tại';
END
GO

-- Kiểm tra xem FOREIGN KEY đã tồn tại chưa
IF NOT EXISTS (
    SELECT * 
    FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS 
    WHERE CONSTRAINT_NAME = 'FK_BankInfo_EntityAccounts'
)
BEGIN
    -- Thêm FOREIGN KEY constraint
    ALTER TABLE BankInfo
    ADD CONSTRAINT FK_BankInfo_EntityAccounts
    FOREIGN KEY (EntityAccountId)
    REFERENCES EntityAccounts(EntityAccountId);
    
    PRINT '✅ Đã thêm FOREIGN KEY constraint FK_BankInfo_EntityAccounts';
END
ELSE
BEGIN
    PRINT '✅ FOREIGN KEY constraint FK_BankInfo_EntityAccounts đã tồn tại';
END
GO

PRINT '✅ Migration script hoàn tất!';
PRINT '📝 Bước tiếp theo: Chạy migrate-bankinfo-to-entityaccountid.js để migrate dữ liệu cũ';
GO

