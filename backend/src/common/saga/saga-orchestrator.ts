import { Logger } from '@nestjs/common';

export interface SagaStep<TContext> {
  readonly name: string;
  execute(context: TContext): Promise<void>;
  compensate?(context: TContext, failureReason: Error): Promise<void>;
}

export interface SagaExecutionResult<TContext> {
  succeeded: boolean;
  rolledBack: boolean;
  completedSteps: string[];
  compensatedSteps: string[];
  failedStep: string | null;
  error: Error | null;
  context: TContext;
}

export class SagaOrchestrator<TContext> {
  private readonly logger = new Logger(SagaOrchestrator.name);

  constructor(
    private readonly sagaName: string,
    private readonly steps: SagaStep<TContext>[],
  ) {}

  async run(context: TContext): Promise<SagaExecutionResult<TContext>> {
    const completedSteps: SagaStep<TContext>[] = [];
    const compensatedStepNames: string[] = [];

    for (const step of this.steps) {
      try {
        await step.execute(context);
        completedSteps.push(step);
      } catch (rawError) {
        const error =
          rawError instanceof Error ? rawError : new Error(String(rawError));

        this.logger.warn(
          `[${this.sagaName}] Step '${step.name}' failed: ${error.message}. Initiating LIFO compensating rollback...`,
        );

        for (let i = completedSteps.length - 1; i >= 0; i--) {
          const completed = completedSteps[i];
          if (typeof completed.compensate === 'function') {
            try {
              await completed.compensate(context, error);
              compensatedStepNames.push(completed.name);
            } catch (compErr) {
              this.logger.error(
                `[${this.sagaName}] Compensating step '${completed.name}' encountered an error: ${(compErr as Error).message}`,
              );
            }
          }
        }

        return {
          succeeded: false,
          rolledBack: compensatedStepNames.length > 0,
          completedSteps: completedSteps.map((s) => s.name),
          compensatedSteps: compensatedStepNames,
          failedStep: step.name,
          error,
          context,
        };
      }
    }

    return {
      succeeded: true,
      rolledBack: false,
      completedSteps: completedSteps.map((s) => s.name),
      compensatedSteps: [],
      failedStep: null,
      error: null,
      context,
    };
  }
}
