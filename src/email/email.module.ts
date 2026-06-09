import { Module } from '@nestjs/common';
import { EmailQueueService } from './email-queue.service';
import { EmailService } from './email.service';
import { EmailWorkerService } from './email-worker.service';

@Module({
  providers: [EmailQueueService, EmailService, EmailWorkerService],
  exports: [EmailService],
})
export class EmailModule {}
