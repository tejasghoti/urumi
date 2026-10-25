import { createUtilApp } from './server.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const app = createUtilApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`util-mcp listening on port ${PORT}`);
});
