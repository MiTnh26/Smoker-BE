-- Migration script to increase Address column size for structured address data
-- Run this script to update existing database

USE SmokerDB;
GO

-- Update Address column in Accounts table
ALTER TABLE dbo.Accounts
ALTER COLUMN Address NVARCHAR(MAX) NULL;
GO

-- Update Address column in BussinessAccounts table  
ALTER TABLE dbo.BussinessAccounts
ALTER COLUMN Address NVARCHAR(MAX) NULL;
GO

-- Update stored procedure parameter for sp_UpdateAccountInfo
CREATE OR ALTER PROCEDURE dbo.sp_UpdateAccountInfo
    @accountId UNIQUEIDENTIFIER,
    @userName NVARCHAR(100) = NULL,
    @avatar NVARCHAR(1000) = NULL,
    @background NVARCHAR(1000) = NULL,
    @bio NVARCHAR(500) = NULL,
    @address NVARCHAR(MAX) = NULL,  -- Changed from NVARCHAR(255)
    @phone NVARCHAR(20) = NULL,
    @gender NVARCHAR(20) = NULL,
    @status NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Accounts
    SET UserName = ISNULL(@userName, UserName),
        Avatar = ISNULL(@avatar, Avatar),
        Background = ISNULL(@background, Background),
        Bio = ISNULL(@bio, Bio),
        Address = ISNULL(@address, Address),
        Phone = ISNULL(@phone, Phone),
        Gender = ISNULL(@gender, Gender),
        Status = ISNULL(@status, Status)
    WHERE AccountId = @accountId;

    SELECT TOP 1 AccountId, Email, Role, UserName, Avatar, Background, Phone, Address, Bio, Gender, Status, LastLogin
    FROM dbo.Accounts
    WHERE AccountId = @accountId;
END
GO

PRINT 'Migration completed: Address column size increased to NVARCHAR(MAX)';
GO

