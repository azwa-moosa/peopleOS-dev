import { Module } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { FieldCipher } from '@bml/crypto';
import { ENV, Env, loadEnv } from './infra/env';
import { DbService } from './infra/db.service';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { TokenService } from './auth/token.service';
import { SecurityContextService } from './auth/security-context.service';
import { AuthGuard } from './auth/auth.guard';
import { AuthController } from './auth/auth.controller';
import { RouteAccessAuditor } from './auth/route-access-auditor';
import { EMPLOYEE_PROVIDER } from './employees/employee.provider';
import { SyntheticEmployeeProvider } from './employees/synthetic.provider';
import { EmployeesController } from './employees/employees.controller';
import { OrgService } from './org/org.service';
import { OrgController } from './org/org.controller';
import { ConfigService } from './config/config.service';
import { PlatformController } from './config/platform.controller';
import { ActionsService } from './actions/actions.service';
import { ActionsController } from './actions/actions.controller';
import { CIPHER, ErService } from './er/er.service';
import { ErController } from './er/er.controller';
import { PreviewController } from './config/preview.controller';
import { EmbeddedOutboxRelay } from './infra/outbox-relay';

@Module({
  imports: [DiscoveryModule],
  controllers: [AuthController, AuditController, EmployeesController, OrgController, PlatformController, ActionsController, ErController, PreviewController],
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    { provide: CIPHER, inject: [ENV], useFactory: (env: Env) => new FieldCipher(env.FIELD_ENCRYPTION_KEY) },
    // Provider switch per environment (EMP-001). The 'hris' adapter is added once DR-04 names the system.
    {
      provide: EMPLOYEE_PROVIDER, inject: [ENV, DbService],
      useFactory: (env: Env, db: DbService) => {
        if (env.PLATFORM_ENV === 'prod') throw new Error('No production EmployeeProvider configured (DR-04). Synthetic provider is DEV/UAT only.');
        return new SyntheticEmployeeProvider(db);
      },
    },
    DbService, AuditService, TokenService, SecurityContextService, OrgService, ConfigService, ActionsService, ErService,
    RouteAccessAuditor, EmbeddedOutboxRelay,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
