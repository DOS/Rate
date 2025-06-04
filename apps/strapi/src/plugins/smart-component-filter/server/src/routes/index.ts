import contentApi from './content-api';
import adminApi from './admin-api';

export default {
  'content-api': {
    type: 'content-api',
    routes: contentApi,
  },
  'admin-api': {
    type: 'admin',
    routes: adminApi,
  },
};
