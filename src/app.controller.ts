import { Controller, Get, Type } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  static CrawlerController: Type<any>;
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    console.log('GET / hit');
    return 'Hello from Nest!';
  }
}
