Feature: Second shop
  Scenario: X tables
    When I log "X start"
    And I open the "tables" page and wait 500 ms
    Then I log "X end"

  Scenario: Y dropdown
    When I log "Y start"
    And I open the "dropdown" page and wait 100 ms
    Then I log "Y end"
