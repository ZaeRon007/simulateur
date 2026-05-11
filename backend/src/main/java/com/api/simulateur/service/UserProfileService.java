package com.api.simulateur.service;

import org.springframework.stereotype.Service;

import com.api.simulateur.exception.NotFoundException;
import com.api.simulateur.model.Score;
import com.api.simulateur.model.User;
import com.api.simulateur.model.dto.UserProfileResponse;
import com.api.simulateur.repository.ScoreRepository;
import com.api.simulateur.repository.UserRepository;

@Service
public class UserProfileService {

    private final UserRepository userRepository;
    private final ScoreRepository scoreRepository;

    public UserProfileService(UserRepository userRepository, ScoreRepository scoreRepository) {
        this.userRepository = userRepository;
        this.scoreRepository = scoreRepository;
    }

    public void saveScore(String email, int reactionTimeMs) {
        User user = userRepository.findByEmail(email.toLowerCase())
            .orElseThrow(() -> new NotFoundException("Utilisateur introuvable"));

        Score score = scoreRepository.findByUserId(user.getId()).orElseGet(() -> {
            Score s = new Score();
            s.setUser(user);
            s.setBestScore(reactionTimeMs);
            return s;
        });

        score.setScore(reactionTimeMs);
        if (reactionTimeMs < score.getBestScore()) {
            score.setBestScore(reactionTimeMs);
        }

        scoreRepository.save(score);
    }

    public UserProfileResponse getProfileByEmail(String email) {
        User user = userRepository.findByEmail(email.toLowerCase())
            .orElseThrow(() -> new NotFoundException("Utilisateur introuvable"));

        Score score = scoreRepository.findByUserId(user.getId()).orElse(null);

        return new UserProfileResponse(
            user.getName(),
            user.getEmail(),
            score != null ? score.getScore() : 0,
            score != null ? score.getBestScore() : 0
        );
    }
}
