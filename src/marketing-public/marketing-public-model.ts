export interface MarketingSession { id: number; sessionDate?: string; startTime?: string; endTime?: string; classroomText?: string; coachNameText?: string; remainingQuota?: number; unavailable?: boolean }
export interface MarketingEnrollment { id: number; campaignId?: number; shareCode?: string; referralCode?: string; headline?: string; campusNameText?: string; studentName?: string; contactPhone?: string; sessionId?: number; sessionText?: string; enrollStatus?: string; payStatus?: string; displayStatus?: string; createTime?: string }
export interface MarketingLanding {
  shareCode: string; playType?: string; headline?: string; subHeadline?: string; coverImageUrl?: string; sellingPoints?: string
  detailText?: string; noticeText?: string; enrollmentFields?: string; posterTheme?: string; campusNameText?: string
  address?: string; contactName?: string; contactPhone?: string; organizationName?: string; signupMode?: string
  payMode?: string; price?: number; originalPrice?: number; quotaTotal?: number; remainingQuota?: number
  enrollStartTime?: string; enrollEndTime?: string; activityStartDate?: string; activityEndDate?: string
  displayStatus?: string; enrollable?: boolean; unenrollableReason?: string; referralEnabled?: boolean
  referralRewardTiers?: string; myEnrollment?: MarketingEnrollment; sessions?: MarketingSession[]
}
export interface MarketingReferral {
  shareCode?: string; referralCode?: string; headline?: string; campusNameText?: string; posterTheme?: string
  coverImageUrl?: string; priceText?: string; referralEnabled?: boolean; visitCount?: number; validReferralCount?: number
  nextTierText?: string; tiers?: Array<{ threshold?: number; rewardType?: string; rewardName?: string; achieved?: boolean; statusText?: string }>
  rewards?: Array<{ id: number; rewardName?: string; tierThreshold?: number; statusText?: string; createTime?: string }>
  invitees?: Array<{ studentName?: string; statusText?: string; counted?: boolean; timeText?: string }>
}
