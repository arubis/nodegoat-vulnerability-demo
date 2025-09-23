defmodule RsolvWeb.Components.DarkModeHelpersTest do
  use ExUnit.Case, async: true
  
  alias RsolvWeb.Components.DarkModeHelpers

  describe "card_classes/1" do
    test "returns default card classes" do
      assert DarkModeHelpers.card_classes() == "bg-white dark:bg-dark-800 "
    end

    test "appends additional classes" do
      assert DarkModeHelpers.card_classes("shadow-lg rounded-lg") == 
        "bg-white dark:bg-dark-800 shadow-lg rounded-lg"
    end
  end

  describe "input_classes/1" do
    test "returns comprehensive input classes with dark mode support" do
      result = DarkModeHelpers.input_classes()
      
      # Should include all necessary classes
      assert result =~ "shadow appearance-none"
      assert result =~ "border dark:border-gray-600"
      assert result =~ "text-gray-700 dark:text-gray-200"
      assert result =~ "bg-white dark:bg-dark-700"
      assert result =~ "focus:ring-brand-blue dark:focus:ring-brand-green"
    end

    test "appends additional classes" do
      result = DarkModeHelpers.input_classes("mt-4")
      assert result =~ "mt-4"
    end
  end

  describe "label_classes/1" do
    test "returns label classes with dark mode support" do
      assert DarkModeHelpers.label_classes() == 
        "block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2 "
    end
  end

  describe "section_classes/2" do
    test "returns default section classes" do
      assert DarkModeHelpers.section_classes() == "bg-white dark:bg-dark-950 "
    end

    test "returns light variant classes" do
      assert DarkModeHelpers.section_classes(:light) == "bg-brand-light dark:bg-dark-900 "
    end

    test "returns dark variant classes" do
      assert DarkModeHelpers.section_classes(:dark) == "bg-gray-50 dark:bg-dark-900 "
    end

    test "appends additional classes" do
      assert DarkModeHelpers.section_classes(:default, "py-20") == "bg-white dark:bg-dark-950 py-20"
    end
  end

  describe "text_classes/2" do
    test "returns default text classes" do
      assert DarkModeHelpers.text_classes() == "text-gray-700 dark:text-gray-300 "
    end

    test "returns muted text classes" do
      assert DarkModeHelpers.text_classes(:muted) == "text-gray-600 dark:text-gray-400 "
    end

    test "returns heading text classes" do
      assert DarkModeHelpers.text_classes(:heading) == "text-gray-900 dark:text-white "
    end

    test "appends additional classes" do
      assert DarkModeHelpers.text_classes(:default, "text-lg") == 
        "text-gray-700 dark:text-gray-300 text-lg"
    end
  end

  describe "button_classes/2" do
    test "returns primary button classes" do
      assert DarkModeHelpers.button_classes(:primary) == "btn-primary "
    end

    test "returns secondary button classes" do
      assert DarkModeHelpers.button_classes(:secondary) == "btn-outline "
    end

    test "returns success button classes" do
      assert DarkModeHelpers.button_classes(:success) == "btn-success "
    end

    test "returns only additional classes for unknown variant" do
      assert DarkModeHelpers.button_classes(:unknown, "custom-class") == "custom-class"
    end
  end
end