-- CREATE TABLE script for Reports table
-- This script creates the Reports table with the exact schema specified
-- Note: Fixed typo in ReporterId (was UNIQUEIDENTIFIER9--, now UNIQUEIDENTIFIER)

USE SmokerDB;
GO

CREATE TABLE Reports(
	ReportId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
	ReporterId UNIQUEIDENTIFIER NULL, -- (lưu entityAccountID vào)
	ReporterRole NVARCHAR(50) NULL, -- Customer/DJ/Dancer/Bar
	TargetType NVARCHAR(50) NULL, -- Account/BusinessAccount/BarPages/Post/UserReview/BarReview
	TargetId UNIQUEIDENTIFIER NULL, -- Sử dụng trong trường hợp nếu đối tượng bị report là bài viết (lưu postid vào)
	TargetOwnerId UNIQUEIDENTIFIER NULL, -- Sử dụng trong trường hợp đối tượng bị report là người dùng (lưu entityaccountID vào)
	Reason NVARCHAR(250) NULL, -- lý do (được fix cứng trong FE)
	Description NVARCHAR(500) NULL, -- thông tin thêm có thể để người dùng thêm
	Status NVARCHAR(50) NULL, -- trạng thái của report: Pending, Review, Resolve
	CreatedAt DATETIME DEFAULT GETDATE(),
	UpdatedAt DATETIME DEFAULT GETDATE(),
	FOREIGN KEY (ReporterId) REFERENCES EntityAccounts(EntityAccountId),
	FOREIGN KEY (TargetOwnerId) REFERENCES EntityAccounts(EntityAccountId)
);
GO

PRINT 'Reports table created successfully';
GO

