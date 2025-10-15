Smoker-BE (Node/Express + MSSQL)

Project Structure

```
Smoker-BE/
├─ server.js                     # Entrypoint: bootstraps Express app
├─ package.json
├─ package-lock.json
└─ src/
   ├─ app.js                     # Init Express, CORS, JSON, routes, DB pool
   ├─ config/
   │  ├─ cloudinary.js          # Cloudinary SDK config (env-driven)
   │  └─ dbConfig.js            # MSSQL connection config
   ├─ db/
   │  └─ sqlserver.js           # MSSQL pool init/get
   ├─ routes/
   │  ├─ authRoutes.js          # POST /api/auth/*
   │  ├─ businessRoutes.js      # Business-specific endpoints
   │  ├─ userRoutes.js          # GET/PUT /api/user/* (supports multipart)
   │  └─ index.js               # Export/compose routers
   ├─ controllers/
   │  ├─ authController.js      # register, google-register, login, google-login
   │  ├─ businessController.js  # business flows
   │  ├─ userController.js      # me, updateProfile (reads Cloudinary URLs)
   │  └─ index.js
   ├─ services/
   │  ├─ authService.js         # bcrypt, jwt, google verify, mail
   │  ├─ businessService.js     # business logic
   │  └─ index.js
   ├─ models/
   │  ├─ accountModel.js        # Accounts queries and updates
   │  └─ index.js
   ├─ middleware/
   │  ├─ authMiddleware.js      # JWT verify
   │  ├─ uploadCloudinary.js    # Cloudinary storage for business uploads
   │  └─ uploadUserCloudinary.js# Cloudinary storage for user profile (avatar/background)
   ├─ utils/
   │  ├─ mailer.js              # nodemailer wrapper
   │  ├─ password.js            # password helpers
   │  ├─ response.js            # success/error helpers
   │  └─ validator.js           # validators (email/password)
   └─ docs/
      └─ api.md                 # API docs
```

Environment (.env)

```
# App
PORT=9999
JWT_SECRET=changeme

# Database
MSSQL_USER=...
MSSQL_PASSWORD=...
MSSQL_DATABASE=...
MSSQL_SERVER=localhost
MSSQL_PORT=1433

# Mail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=...
EMAIL_PASS=...
EMAIL_FROM="Smoker <no-reply@smoker.com>"

# Google
GOOGLE_CLIENT_ID=optional

# Cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Scripts

```
npm i
npm run dev
```

Notes
- PUT /api/user/profile supports multipart form with fields: avatar (file/url), background (file/url), plus userName, bio, address, phone.
- Uploaded images are stored in Cloudinary under folders: users/<userId>/avatar and users/<userId>/background.

