-- Add LanguagePreference column to Accounts table
-- This allows users to store their language preference (en/vi)

-- Check if column exists, if not add it
IF NOT EXISTS (
    SELECT * 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Accounts' 
    AND COLUMN_NAME = 'LanguagePreference'
)
BEGIN
    ALTER TABLE Accounts 
    ADD LanguagePreference NVARCHAR(10) DEFAULT 'vi' NOT NULL;
    
    -- Set default value for existing users
    UPDATE Accounts 
    SET LanguagePreference = 'vi' 
    WHERE LanguagePreference IS NULL;
    
    PRINT 'LanguagePreference column added successfully';
END
ELSE
BEGIN
    PRINT 'LanguagePreference column already exists';
END

-- Optional: Create index for faster queries
IF NOT EXISTS (
    SELECT * 
    FROM sys.indexes 
    WHERE name = 'IX_Accounts_LanguagePreference' 
    AND object_id = OBJECT_ID('Accounts')
)
BEGIN
    CREATE INDEX IX_Accounts_LanguagePreference 
    ON Accounts(LanguagePreference);
    
    PRINT 'Index created successfully';
END
ELSE
BEGIN
    PRINT 'Index already exists';
END


