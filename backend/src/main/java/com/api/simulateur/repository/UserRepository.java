package com.api.simulateur.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.api.simulateur.model.User;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);
}
