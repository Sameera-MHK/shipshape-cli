const url = process.env.API_URL;
const db = process.env.DATABASE_URL;
const { STRIPE_KEY, API_URL: again } = process.env;
const optional = process?.env?.SENTRY_DSN;
console.log(url, db, STRIPE_KEY, again, optional);
