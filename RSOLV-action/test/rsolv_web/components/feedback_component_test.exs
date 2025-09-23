defmodule RsolvWeb.FeedbackComponentTest do
  use RsolvWeb.ConnCase, async: true
  import Phoenix.Component
  import Phoenix.LiveViewTest
  
  alias RsolvWeb.FeedbackComponent

  describe "feedback_form component" do
    test "renders with dark mode classes using helpers", %{conn: conn} do
      assigns = %{
        type: "general",
        title: "Test Feedback",
        prompt: "Share your thoughts",
        button_text: "Submit",
        show_email: true,
        expanded: false,
        categories: []
      }
      
      html = rendered_to_string(~H"""
        <FeedbackComponent.feedback_form {assigns} />
      """)
      
      # Should use card classes helper
      assert html =~ "bg-white dark:bg-dark-800"
      
      # Should use text classes for labels
      assert html =~ "text-gray-700 dark:text-gray-300"
      
      # Should use input classes
      assert html =~ "dark:bg-dark-700"
      assert html =~ "dark:text-gray-200"
      assert html =~ "dark:border-gray-600"
    end
  end
end