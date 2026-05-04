package com.api.simulateur.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record UserProfileResponse(
    String nom,
    String email,
    Integer score,
    @JsonProperty("best_score")
    Integer bestScore
) {
}
