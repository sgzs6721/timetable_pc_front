export interface Campus {
  id: number
  name: string
  address?: string
  contactPerson?: string
  contactPhone?: string
  visibleInList?: boolean
  status?: number
}

export interface Person {
  id: number
  phone?: string
  nickname?: string
  displayName?: string
  gender?: string
  status?: number
  isSubstituteTeacher?: boolean
  positionId?: number
  positionName?: string
  campusAdmin?: boolean
  hireDate?: string
  idCard?: string
}

export interface Position {
  id?: number
  name: string
  campusAdmin?: boolean
  sales?: boolean
  campusId?: number
}
