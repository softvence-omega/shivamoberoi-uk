import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";


@Module({
    imports: [
        ConfigModule,
        PassportModule
    ],
    providers:[],
    exports:[]
})

export class AuthModule {}
