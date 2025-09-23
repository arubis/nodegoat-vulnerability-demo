defmodule RsolvLanding.FeatureFlagCase do
  @moduledoc """
  This module provides test helpers for working with feature flags.
  """
  
  @doc """
  Enables a feature flag for the duration of a test.
  """
  def enable_feature(feature) do
    # Store the original values
    original_enabled = Application.get_env(:rsolv_landing, :enabled_features, [])
    original_disabled = Application.get_env(:rsolv_landing, :disabled_features, [])
    
    # Enable the feature
    Application.put_env(:rsolv_landing, :enabled_features, [feature | original_enabled])
    Application.put_env(:rsolv_landing, :disabled_features, List.delete(original_disabled, feature))
    
    # Return a function to restore the original state
    fn ->
      Application.put_env(:rsolv_landing, :enabled_features, original_enabled)
      Application.put_env(:rsolv_landing, :disabled_features, original_disabled)
    end
  end
  
  @doc """
  Disables a feature flag for the duration of a test.
  """
  def disable_feature(feature) do
    # Store the original values
    original_enabled = Application.get_env(:rsolv_landing, :enabled_features, [])
    original_disabled = Application.get_env(:rsolv_landing, :disabled_features, [])
    
    # Disable the feature
    Application.put_env(:rsolv_landing, :enabled_features, List.delete(original_enabled, feature))
    Application.put_env(:rsolv_landing, :disabled_features, [feature | original_disabled])
    
    # Return a function to restore the original state
    fn ->
      Application.put_env(:rsolv_landing, :enabled_features, original_enabled)
      Application.put_env(:rsolv_landing, :disabled_features, original_disabled)
    end
  end
end