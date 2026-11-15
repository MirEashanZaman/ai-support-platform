import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

export interface IngestionJobPayload {
  tenantId: string;
  documentId: string;
  attempt?: number;
}

@Injectable()
export class RabbitMqService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private readonly inMemoryQueue: IngestionJobPayload[] = [];
  private readonly inMemoryDlq: IngestionJobPayload[] = [];

  readonly queueName: string;
  readonly dlqName: string;
  readonly maxRetries = 3;

  constructor(private readonly configService: ConfigService) {
    this.queueName = this.configService.get<string>(
      'RABBITMQ_INGESTION_QUEUE',
      'document.ingestion.queue',
    );
    this.dlqName = this.configService.get<string>(
      'RABBITMQ_DLQ',
      'document.ingestion.dlq',
    );
  }

  async connect(): Promise<void> {
    const url = this.configService.get<string>('RABBITMQ_URL');
    if (!url || this.configService.get<string>('NODE_ENV') === 'test') {
      return;
    }
    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      await this.channel.assertQueue(this.dlqName, { durable: true });
      await this.channel.assertQueue(this.queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': this.dlqName,
        },
      });
      this.logger.log(
        `Connected to RabbitMQ queues: ${this.queueName} (DLQ: ${this.dlqName})`,
      );
    } catch (err) {
      this.logger.warn(
        `RabbitMQ connection not available (using local queue fallback): ${(err as Error).message}`,
      );
    }
  }

  async publishIngestionJob(payload: IngestionJobPayload): Promise<void> {
    const job: IngestionJobPayload = {
      ...payload,
      attempt: payload.attempt ?? 1,
    };

    if (this.channel) {
      this.channel.sendToQueue(
        this.queueName,
        Buffer.from(JSON.stringify(job)),
        { persistent: true },
      );
      return;
    }

    if ((job.attempt ?? 1) > this.maxRetries) {
      this.inMemoryDlq.push(job);
    } else {
      this.inMemoryQueue.push(job);
    }
  }

  getInMemoryQueues(): {
    queue: IngestionJobPayload[];
    dlq: IngestionJobPayload[];
  } {
    return {
      queue: [...this.inMemoryQueue],
      dlq: [...this.inMemoryDlq],
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [RabbitMqService],
  exports: [RabbitMqService],
})
export class RabbitMqModule {}

