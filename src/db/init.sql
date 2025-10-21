-- Initialization SQL for Smoker-BE Database
-- Creates Accounts and BusinessAccounts tables with their relationships

SET NOCOUNT ON;
GO

USE master;
GO

-- Create database if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'SmokerDB')
BEGIN
    CREATE DATABASE SmokerDB;
END
GO

USE SmokerDB;
GO

-- Drop tables if they exist (useful during development)
IF OBJECT_ID('dbo.BussinessAccounts', 'U') IS NOT NULL
    DROP TABLE dbo.BussinessAccounts;
IF OBJECT_ID('dbo.Accounts', 'U') IS NOT NULL
    DROP TABLE dbo.Accounts;
GO

-- Create Accounts table
CREATE TABLE dbo.Accounts (
    AccountId UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    Email NVARCHAR(100) NOT NULL UNIQUE,
    Password NVARCHAR(100) NULL,
    Role NVARCHAR(50) NOT NULL DEFAULT 'user',
    UserName NVARCHAR(100) NULL,
    Avatar NVARCHAR(1000) NULL,
    Background NVARCHAR(1000) NULL,
    Phone NVARCHAR(20) NULL,
    Address NVARCHAR(255) NULL,
    Bio NVARCHAR(500) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'active',
    LastLogin DATETIME2 NULL
);
GO

-- Create BusinessAccounts table
CREATE TABLE dbo.BussinessAccounts (
    BussinessAccountId UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    AccountId UNIQUEIDENTIFIER NOT NULL,
    UserName NVARCHAR(100) NOT NULL,
    Role NVARCHAR(50) NOT NULL,
    Phone NVARCHAR(50) NULL,
    Address NVARCHAR(255) NULL,
    Bio NVARCHAR(MAX) NULL,
    Avatar NVARCHAR(1000) NULL,
    Background NVARCHAR(1000) NULL,
    BankInfoId UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'pending',
    FOREIGN KEY (AccountId) REFERENCES dbo.Accounts(AccountId)
);
GO

-- Sample seed data for Accounts
INSERT INTO dbo.Accounts (AccountId, Email, Password, Role, UserName, Status)
VALUES
    (NEWID(), 'user@example.com', 'hashed_password_1', 'user', 'Regular User', 'active'),
    (NEWID(), 'business@example.com', 'hashed_password_2', 'business', 'Business Owner', 'active'),
    (NEWID(), 'admin@example.com', 'hashed_password_3', 'admin', 'Admin User', 'active');
GO

-- Stored Procedures for Accounts

-- Find account by email
CREATE OR ALTER PROCEDURE dbo.sp_FindAccountByEmail
    @email NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 1 AccountId, Email, Password, Role, UserName, Avatar, Background, Phone, Address, Bio, Status, LastLogin
    FROM dbo.Accounts
    WHERE Email = @email;
END
GO

-- Get account by ID
CREATE OR ALTER PROCEDURE dbo.sp_GetAccountById
    @accountId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 1 AccountId, Email, Role, UserName, Avatar, Background, Phone, Address, Bio, Status, LastLogin
    FROM dbo.Accounts
    WHERE AccountId = @accountId;
END
GO

-- Create new account
CREATE OR ALTER PROCEDURE dbo.sp_CreateAccount
    @email NVARCHAR(100),
    @password NVARCHAR(100),
    @role NVARCHAR(50),
    @status NVARCHAR(20),
    @userName NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Accounts (Email, Password, Role, Status, UserName)
    OUTPUT inserted.AccountId, inserted.Email, inserted.Role, inserted.Status
    VALUES (@email, @password, @role, @status, @userName);
END
GO

-- Update last login
CREATE OR ALTER PROCEDURE dbo.sp_UpdateLastLogin
    @accountId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Accounts
    SET LastLogin = GETUTCDATE()
    WHERE AccountId = @accountId;
END
GO

-- Update account information
CREATE OR ALTER PROCEDURE dbo.sp_UpdateAccountInfo
    @accountId UNIQUEIDENTIFIER,
    @userName NVARCHAR(100) = NULL,
    @avatar NVARCHAR(1000) = NULL,
    @background NVARCHAR(1000) = NULL,
    @bio NVARCHAR(500) = NULL,
    @address NVARCHAR(255) = NULL,
    @phone NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Accounts
    SET UserName = ISNULL(@userName, UserName),
        Avatar = ISNULL(@avatar, Avatar),
        Background = ISNULL(@background, Background),
        Bio = ISNULL(@bio, Bio),
        Address = ISNULL(@address, Address),
        Phone = ISNULL(@phone, Phone)
    WHERE AccountId = @accountId;

    SELECT TOP 1 AccountId, Email, Role, UserName, Avatar, Background, Phone, Address, Bio, Status, LastLogin
    FROM dbo.Accounts
    WHERE AccountId = @accountId;
END
GO

-- Stored Procedures for BusinessAccounts

-- Create business account
CREATE OR ALTER PROCEDURE dbo.sp_CreateBusinessAccount
    @accountId UNIQUEIDENTIFIER,
    @userName NVARCHAR(100),
    @role NVARCHAR(50),
    @phone NVARCHAR(50) = NULL,
    @address NVARCHAR(255) = NULL,
    @bio NVARCHAR(MAX) = NULL,
    @avatar NVARCHAR(1000) = NULL,
    @background NVARCHAR(1000) = NULL,
    @bankInfoId UNIQUEIDENTIFIER = NULL,
    @status NVARCHAR(20) = 'pending'
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.BussinessAccounts (
        AccountId, UserName, Role, Phone, Address, Bio, 
        Avatar, Background, BankInfoId, Status
    )
    OUTPUT 
        inserted.BussinessAccountId, 
        inserted.AccountId, 
        inserted.UserName, 
        inserted.Role, 
        inserted.Status
    VALUES (
        @accountId, @userName, @role, @phone, @address, @bio,
        @avatar, @background, @bankInfoId, @status
    );
END
GO

-- Update business account files
CREATE OR ALTER PROCEDURE dbo.sp_UpdateBusinessAccountFiles
    @BussinessAccountId UNIQUEIDENTIFIER,
    @Avatar NVARCHAR(1000) = NULL,
    @Background NVARCHAR(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.BussinessAccounts
    SET Avatar = ISNULL(@Avatar, Avatar),
        Background = ISNULL(@Background, Background)
    WHERE BussinessAccountId = @BussinessAccountId;

    SELECT Avatar, Background
    FROM dbo.BussinessAccounts
    WHERE BussinessAccountId = @BussinessAccountId;
END
GO

-- End of initialization script