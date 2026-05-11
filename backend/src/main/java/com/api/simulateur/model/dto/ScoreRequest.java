package com.api.simulateur.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record ScoreRequest(
    @JsonProperty("reaction_time")
    Integer reactionTime
) {
}
