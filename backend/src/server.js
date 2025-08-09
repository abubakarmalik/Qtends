const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');

(async () => {
  await connectDB();
  app.listen(env.PORT, () =>
    console.log(`🚀 Server running at http://localhost:${env.PORT}`),
  );
})();
