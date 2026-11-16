import { IsIn, IsString, Length } from 'class-validator';

/** The body of a registration request: the equipment's serial number and type. */
export class RegisterEquipmentDto {
  @IsString()
  @Length(1, 64)
  serialNumber: string;

  @IsIn(['BIKE', 'TREADMILL', 'ROWER'])
  type: string;
}
