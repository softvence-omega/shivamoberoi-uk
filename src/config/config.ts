// import {registerAs}  from '@nestjs/config'


// export default registerAs('config', () => ({
//     port: parseInt(process.env.PORT, 10) || 3000,
//     jwtSecret: process.env.JWT_SECRET,
//     mongodbUri: process.env.MONGODB_URI,
// }))
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (configService: ConfigService) => ({
  uri: configService.get<string>('MONGODB_URI'),
  useNewUrlParser: true,
  useUnifiedTopology: true,
});