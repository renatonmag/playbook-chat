export type EventCategory =
  // Trend continuation / resumption
  | "trend_resumption"
  | "trend_continuation"
  | "strong_trend_bar"
  | "follow_through"
  | "second_entry_with_trend"
  | "measured_move_projection"

  // Trend weakening / transition
  | "trend_weakening"
  | "loss_of_momentum"
  | "deep_pullback"
  | "transition_to_trading_range"
  | "two_sided_trading"

  // Pullbacks
  | "pullback"
  | "small_pullback"
  | "deep_pullback"
  | "two_legged_pullback"
  | "pullback_to_moving_average"
  | "pullback_to_breakout_point"
  | "pullback_to_support"
  | "pullback_to_resistance"
  | "failed_pullback"

  // Breakouts
  | "breakout_attempt"
  | "bull_breakout_attempt"
  | "bear_breakout_attempt"
  | "successful_breakout"
  | "failed_breakout"
  | "breakout_pullback"
  | "breakout_test"
  | "breakout_mode"
  | "micro_breakout"
  | "strong_breakout_bar"
  | "weak_breakout"

  // Reversals
  | "reversal_attempt"
  | "major_reversal_attempt"
  | "minor_reversal_attempt"
  | "failed_reversal"
  | "successful_reversal"
  | "trend_reversal"
  | "two_legged_reversal"
  | "higher_low_major_trend_reversal"
  | "lower_high_major_trend_reversal"
  | "wedge_reversal"
  | "final_flag_reversal"
  | "micro_double_top_reversal"
  | "micro_double_bottom_reversal"

  // Climaxes and exhaustion
  | "climax"
  | "buy_climax"
  | "sell_climax"
  | "exhaustion"
  | "exhaustion_gap"
  | "parabolic_wedge"
  | "consecutive_buy_climaxes"
  | "consecutive_sell_climaxes"

  // Tests of levels
  | "test_of_support"
  | "test_of_resistance"
  | "test_of_high"
  | "test_of_low"
  | "test_of_prior_high"
  | "test_of_prior_low"
  | "test_of_open"
  | "test_of_close"
  | "test_of_moving_average"
  | "test_of_breakout_point"
  | "test_of_measured_move_target"

  // Trading range behavior
  | "trading_range_continuation"
  | "range_expansion"
  | "range_contraction"
  | "range_high_rejection"
  | "range_low_rejection"
  | "middle_of_range_confusion"
  | "failed_attempt_to_exit_range"
  | "buy_low_sell_high_setup"

  // Traps / failures
  | "bull_trap"
  | "bear_trap"
  | "failed_high_1"
  | "failed_high_2"
  | "failed_low_1"
  | "failed_low_2"
  | "failed_second_entry"
  | "failed_signal_bar"
  | "failed_follow_through"

  // Gaps and open behavior
  | "gap_open"
  | "gap_up"
  | "gap_down"
  | "gap_fill_attempt"
  | "failed_gap_fill"
  | "open_reversal"
  | "opening_range_breakout"
  | "failed_opening_range_breakout"

  // Day structure events
  | "trend_from_open_confirmation"
  | "possible_trend_day_confirmation"
  | "spike_and_channel_confirmation"
  | "broad_channel_confirmation"
  | "trading_range_day_confirmation"
  | "double_distribution_confirmation"

  // Signal quality / uncertainty
  | "strong_signal_bar"
  | "weak_signal_bar"
  | "inside_bar"
  | "outside_bar"
  | "doji_bar"
  | "bad_context_signal"
  | "unclear";

export type EventFamily =
  | "trend"
  | "pullback"
  | "breakout"
  | "reversal"
  | "climax"
  | "test"
  | "trading_range"
  | "trap"
  | "open"
  | "day_structure"
  | "signal_quality"
  | "unclear";
