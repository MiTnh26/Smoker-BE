-- Migration: Add TransferProofImage column to WithdrawRequests table
-- Date: 2026-01-01

USE Smoker;
GO

-- Check if column exists before adding
IF NOT EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[WithdrawRequests]') 
    AND name = 'TransferProofImage'
)
BEGIN
    ALTER TABLE [dbo].[WithdrawRequests]
    ADD [TransferProofImage] [nvarchar](500) NULL;
    
    PRINT 'Column TransferProofImage added successfully to WithdrawRequests table.';
END
ELSE
BEGIN
    PRINT 'Column TransferProofImage already exists in WithdrawRequests table.';
END
GO

