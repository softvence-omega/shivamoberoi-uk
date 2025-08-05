// import { Controller, Get, Query, UseGuards, ValidationPipe } from '@nestjs/common';
// import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
// import { AuthGuard } from '@nestjs/passport';
// import { CombinedAnalyzerService } from './combined-analyzer.service';
// import { GetBrokenLinksDto } from 'src/dto/broken-link.dto';


// @ApiTags('combined-analyzer')
// @Controller('combined-analyzer')
// export class CombinedAnalyzerController {
//   constructor(private readonly combinedAnalyzerService: CombinedAnalyzerService) {}

//   @Get()
//   // @UseGuards(AuthGuard('jwt'))
//   // @ApiBearerAuth()
//   async getCombinedAnalysis(
//     @Query(ValidationPipe) { url, page, limit }: GetBrokenLinksDto,
//   ) {
//     const skip = (page - 1) * limit;
//     return this.combinedAnalyzerService.getCombinedAnalysis(url, skip, limit);
//   }
// }