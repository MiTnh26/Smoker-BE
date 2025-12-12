-- Migration script to create Reports table
-- Run this script to create or update the Reports table structure
-- This table stores user reports for various entities (Account, BusinessAccount, BarPages, Post, UserReview, BarReview)

USE SmokerDB;
GO

-- Drop table if exists (for development/testing - comment out in production)
-- IF OBJECT_ID('dbo.Reports', 'U') IS NOT NULL
--     DROP TABLE dbo.Reports;
-- GO

-- Create Reports table if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Reports]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Reports](
        [ReportId] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [ReporterId] UNIQUEIDENTIFIER NULL, -- (lưu entityAccountID vào)
        [ReporterRole] NVARCHAR(50) NULL, -- Customer/DJ/Dancer/Bar
        [TargetType] NVARCHAR(50) NULL, -- Account/BusinessAccount/BarPages/Post/UserReview/BarReview
        [TargetId] UNIQUEIDENTIFIER NULL, -- Sử dụng trong trường hợp nếu đối tượng bị report là bài viết (lưu postid vào)
        [TargetOwnerId] UNIQUEIDENTIFIER NULL, -- Sử dụng trong trường hợp đối tượng bị report là người dùng (lưu entityaccountID vào)
        [Reason] NVARCHAR(250) NULL, -- lý do (được fix cứng trong FE)
        [Description] NVARCHAR(500) NULL, -- thông tin thêm có thể để người dùng thêm
        [Status] NVARCHAR(50) NULL, -- trạng thái của report: Pending, Review, Resolve
        [CreatedAt] DATETIME DEFAULT GETDATE(),
        [UpdatedAt] DATETIME DEFAULT GETDATE(),
        FOREIGN KEY ([ReporterId]) REFERENCES [dbo].[EntityAccounts]([EntityAccountId]),
        FOREIGN KEY ([TargetOwnerId]) REFERENCES [dbo].[EntityAccounts]([EntityAccountId])
    );
    
    PRINT 'Reports table created successfully';
END
ELSE
BEGIN
    -- Table exists, check and add missing columns/constraints
    PRINT 'Reports table already exists. Checking for missing columns and constraints...';
    
    -- Add ReportId column with default if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Reports]') AND name = 'ReportId')
    BEGIN
        ALTER TABLE [dbo].[Reports] ADD [ReportId] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID();
        PRINT 'Added ReportId column';
    END
    
    -- Add ReporterId column if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Reports]') AND name = 'ReporterId')
    BEGIN
        ALTER TABLE [dbo].[Reports] ADD [ReporterId] UNIQUEIDENTIFIER NULL;
        PRINT 'Added ReporterId column';
    END
    
    -- Add ReporterRole column if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Reports]') AND name = 'ReporterRole')
    BEGIN
        ALTER TABLE [dbo].[Reports] ADD [ReporterRole] NVARCHAR(50) NULL;
        PRINT 'Added ReporterRole column';
    END
    
    -- Add TargetType column if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Reports]') AND name = 'TargetType')
    BEGIN
        ALTER TABLE [dbo].[Reports] ADD [TargetType] NVARCHAR(50) NULL;
        PRINT 'Added TargetType column';
    END
    
    -- Add TargetId column if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Reports]') AND name = 'TargetId')
    BEGIN
        ALTER TABLE [dbo].[Reports] ADD [TargetId] UNIQUEIDENTIFIER NULL;
        PRINT 'Added TargetId column';
    END
    
    -- Add TargetOwnerId column if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Reports]') AND name = 'TargetOwnerId')
    BEGIN
        ALTER TABLE [dbo].[Reports] ADD [TargetOwnerId] UNIQUEIDENTIFIER NULL;
        PRINT 'Added TargetOwnerId column';
    END
    
    -- Add Reason column if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Reports]') AND name = 'Reason')
    BEGIN
        ALTER TABLE [dbo].[Reports] ADD [Reason] NVARCHAR(250) NULL;
        PRINT 'Added Reason column';
    END
    
    -- Add Description column if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Reports]') AND name = 'Description')
    BEGIN
        ALTER TABLE [dbo].[Reports] ADD [Description] NVARCHAR(500) NULL;
        PRINT 'Added Description column';
    END
    
    -- Add Status column if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Reports]') AND name = 'Status')
    BEGIN
        ALTER TABLE [dbo].[Reports] ADD [Status] NVARCHAR(50) NULL;
        PRINT 'Added Status column';
    END
    
    -- Add CreatedAt column if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Reports]') AND name = 'CreatedAt')
    BEGIN
        ALTER TABLE [dbo].[Reports] ADD [CreatedAt] DATETIME DEFAULT GETDATE();
        PRINT 'Added CreatedAt column';
    END
    
    -- Add UpdatedAt column if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Reports]') AND name = 'UpdatedAt')
    BEGIN
        ALTER TABLE [dbo].[Reports] ADD [UpdatedAt] DATETIME DEFAULT GETDATE();
        PRINT 'Added UpdatedAt column';
    END
    
    -- Add foreign key constraint for ReporterId if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Reports_ReporterId_EntityAccounts')
    BEGIN
        ALTER TABLE [dbo].[Reports]
        ADD CONSTRAINT FK_Reports_ReporterId_EntityAccounts
        FOREIGN KEY ([ReporterId]) REFERENCES [dbo].[EntityAccounts]([EntityAccountId]);
        PRINT 'Added foreign key constraint FK_Reports_ReporterId_EntityAccounts';
    END
    
    -- Add foreign key constraint for TargetOwnerId if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Reports_TargetOwnerId_EntityAccounts')
    BEGIN
        ALTER TABLE [dbo].[Reports]
        ADD CONSTRAINT FK_Reports_TargetOwnerId_EntityAccounts
        FOREIGN KEY ([TargetOwnerId]) REFERENCES [dbo].[EntityAccounts]([EntityAccountId]);
        PRINT 'Added foreign key constraint FK_Reports_TargetOwnerId_EntityAccounts';
    END
    
    PRINT 'Reports table structure verified and updated';
END
GO

PRINT 'Migration completed: Reports table is ready';
GO

