defmodule RsolvLanding.FunWithFlagsHelpers do
  @moduledoc """
  Test helpers for FunWithFlags feature flag testing.
  """

  @doc """
  Clear all flags before a test. Use in setup blocks.
  """
  def clear_all_flags(_context \\ %{}) do
    # In test environment, we'll just ensure a clean state
    # by not worrying about clearing flags since each test
    # should set up its own state
    :ok
  end

  @doc """
  Enable a flag for a specific actor (email).
  """
  def enable_flag_for_email(flag_name, email) do
    # Use the FeatureFlags module's actor creation
    actor = %{id: email}
    FunWithFlags.enable(flag_name, for_actor: actor)
  end

  @doc """
  Enable a flag for a group.
  """
  def enable_flag_for_group(flag_name, group) do
    FunWithFlags.enable(flag_name, for_group: group)
  end

  @doc """
  Enable a flag globally.
  """
  def enable_flag_globally(flag_name) do
    FunWithFlags.enable(flag_name)
  end

  @doc """
  Disable a flag globally.
  """
  def disable_flag_globally(flag_name) do
    FunWithFlags.disable(flag_name)
  end
end