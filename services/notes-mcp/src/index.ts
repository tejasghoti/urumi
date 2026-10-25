import { createNotesApp } from './server.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const app = createNotesApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`notes-mcp listening on port ${PORT}`);
});
