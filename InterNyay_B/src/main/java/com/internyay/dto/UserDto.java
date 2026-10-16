package com.internyay.dto;

import com.internyay.entity.User;
import lombok.*;

import java.time.LocalDateTime;

// User details sent to the frontend, the password is never included
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class UserDto {

    public Long id;
    public String name;
    public String email;
    public String phone;
    public String barNo;
    public String specialization;
    public String chamber;
    public String profilePicture;

    public String upiId;
    // Payment QR code image
    public String qrImage;

    public String planCode;
    // Associate limit set by an admin for this advocate (null = the plan's limit applies, -1 = unlimited)
    public Integer associateLimit;

    public String role;
    public Boolean active;
    // True when the user deactivated their own account
    public Boolean selfDeactivated;
    public LocalDateTime createdAt;

    // Only filled for the user's own profile
    public String advocateCode;

    // Only filled for the user's own profile
    public Boolean passwordSet;
    public Boolean googleLinked;
    // Only filled for the user's own profile: has a transaction PIN been created
    public Boolean txnPinSet;
    // Only filled for the user's own profile: ids of the preferred courts (empty when none was set)
    public java.util.List<Long> courtPreferenceIds;

    // For an associate, the advocate they work under
    public Long advocateId;
    public String advocateName;
    public String advocateBarNo;

    // Builds the DTO from the user, plan is only set for advocates
    public static UserDto from(User u, String qrImage) {
        User adv = u.getAdvocate();
        return UserDto.builder()
                .id(u.getId())
                .name(u.getName())
                .email(u.getEmail())
                .phone(u.getPhone())
                .barNo(u.getBarNo())
                .specialization(u.getSpecialization())
                .chamber(u.getChamber())
                .profilePicture(u.getProfilePicture())
                .upiId(u.getUpiId())
                .qrImage(qrImage)
                .role(u.getRole())
                .planCode(u.isAdvocate() ? (u.getPlanCode() == null ? "FREE" : u.getPlanCode()) : null)
                .associateLimit(u.isAdvocate() ? u.getAssociateLimit() : null)
                .active(u.getActive())
                .selfDeactivated(Boolean.TRUE.equals(u.getSelfDeactivated()))
                .createdAt(u.getCreatedAt())
                .advocateId(adv != null ? adv.getId() : null)
                .advocateName(adv != null ? adv.getName() : null)
                .advocateBarNo(adv != null ? adv.getBarNo() : null)
                .build();
    }

    // Adds the private details only the user may see
    public static UserDto fromSelf(User u, String qrImage) {
        UserDto dto = from(u, qrImage);
        dto.advocateCode = u.isAdvocate() ? u.getAdvocateCode() : null;
        dto.passwordSet = u.hasPassword();
        dto.googleLinked = u.getGoogleId() != null;
        dto.txnPinSet = u.hasTxnPin();
        dto.courtPreferenceIds = com.internyay.util.CourtPreferences.parse(u.getCourtPreferences());
        return dto;
    }
}
