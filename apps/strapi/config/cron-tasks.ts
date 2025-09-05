// https://docs.strapi.io/dev-docs/configurations/cron

import { organizeMediaLibrary } from '../src/services/organizeMediaLibrary';

const sayHelloJob = {
  task: ({ strapi }: any) => {
    // Add your own logic here (e.g. send a queue of email, create a database backup, etc.).
    console.log("A beautiful start to the week!")
  },
  /**
   * Simple example.
   * Every monday at 1am.
   */
  options: {
    rule: "0 0 1 * * 1",
  },
}

const organizeMediaJob = {
  task: async ({ strapi }: any) => {
    console.log("[Cron] Starting media library organization...");
    await organizeMediaLibrary(strapi);
  },
  options: {
    // Chạy mỗi 1 phút để test ngay
    rule: "*/1 * * * *",
    tz: "Asia/Ho_Chi_Minh",
  },
}

export default {
  sayHelloJob,
  organizeMediaJob,
}
