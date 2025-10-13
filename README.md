Smoker-BE (Node/Express + MSSQL)

Structure:
- server.js
- src/
  - app.js (init Express, CORS, routes, SQL pool)
  - db/sqlserver.js (mssql pool, init/get)
  - config/dbConfig.js (env-based MSSQL config)
  - routes/
    - authRoutes.js (POST /api/auth/*)
    - userRoutes.js (GET/PUT /api/user/*)
    - index.js (export routers)
  - controllers/
    - authController.js (register, google-register, login, google-login)
    - userController.js (me, updateProfile)
    - index.js
  - services/
    - authService.js (business logic: bcrypt, jwt, google verify, mail)
    - index.js
  - models/
    - accountModel.js (Accounts queries, profile check)
    - index.js
  - middleware/
    - authMiddleware.js (JWT verify)
  - utils/
    - validator.js (email/password regex; Gmail enforced)
    - password.js (generateRandomPassword)
    - mailer.js (nodemailer wrapper)
    - response.js (helper)
  - docs/api.md (auth flow docs)

Env (.env):
PORT=9999
JWT_SECRET=changeme
MSSQL_USER=...
MSSQL_PASSWORD=...
MSSQL_DATABASE=...
MSSQL_SERVER=localhost
MSSQL_PORT=1433
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=...
EMAIL_PASS=...
EMAIL_FROM="Smoker <no-reply@smoker.com>"
GOOGLE_CLIENT_ID=optional

Scripts:
1) npm i
2) npm run dev

