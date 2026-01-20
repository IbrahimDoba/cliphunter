import { app } from './app';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  logger.info(`Backend server running on http://localhost:${PORT}`);
});
