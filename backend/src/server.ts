import { app } from './app.js';
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || 'localhost';
app.listen(port, host, () =>
  console.log(
    `[server] Store API: http://${host}:${port} | Storefront: http://${host}:${port}/ | Web Panel: http://${host}:${port}/ (admin host) or http://${host}:${port}/admin/`,
  ),
);
