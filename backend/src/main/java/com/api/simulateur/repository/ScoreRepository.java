package com.api.simulateur.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.api.simulateur.model.Score;

public interface ScoreRepository extends JpaRepository<Score, Long> {

    Optional<Score> findByUserId(Long userId);
}
