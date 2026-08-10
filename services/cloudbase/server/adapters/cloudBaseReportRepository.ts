import type { database as cloudDatabase } from 'wx-server-sdk';
import type { UserReport } from '../../shared/contracts';
import type { ReportRepository } from '../reports/service';

type CloudDatabase = ReturnType<typeof cloudDatabase>;

export class CloudBaseReportRepository implements ReportRepository {
  constructor(private readonly database: CloudDatabase) {}

  async create(report: UserReport): Promise<void> {
    await this.database.collection('user_reports').doc(report._id).set({ data: report });
  }
}
