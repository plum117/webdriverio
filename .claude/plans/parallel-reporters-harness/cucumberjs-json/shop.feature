Feature: Parallel shop
  Background:
    Given I open the "index" page

  Scenario: A checkboxes
    When I log "A start"
    And I open the "checkboxes" page and wait 900 ms
    Then I log "A end"

  Scenario: B login fails
    When I log "B start"
    And I open the "login" page and wait 300 ms
    Then the step fails

  Scenario: C inputs
    When I log "C start"
    And I open the "inputs" page and wait 600 ms
    Then I log "C end"

  Scenario Outline: D <page>
    When I log "D <page> start"
    And I open the "<page>" page and wait <ms> ms
    Then I log "D <page> end"
    Examples:
      | page     | ms  |
      | tables   | 700 |
      | dropdown | 200 |
