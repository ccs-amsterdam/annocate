## TO CLAUDE: for myself notes. Do not suddnely implement without aksing me anything

## notes


- on study complete, there needs to be a way to go to the coder overview page, and perhaps also to close the tab/window (if thats possible, or just a message that they can close the window)
- when clicking on the design tab, it should first show a simple screen to pick between going to the editor and units, with basic information about the editor and units (deployed version, draft version, nr of units, column types). These are two big cards basically. WHen the pick one they see what we already have (switching betwen editor and units possible via the tabs). The card design is just so people don't get lost and do not see that therei s als a units sub tab
- max height in desktop view when coding
- buttons in span annotations closer to selection (either move the menu up, or also make a dropdown menu option)
- highlighting selections when editing
- coder voerview page should show if a job was "quit" (not it still says continue)
- Put the "study" item elsewhere. Dont make it look like a normal item. Confusing.
- keep the add item button if there are items or dont have it at all. Also use this so that the list doeasn't jump when items are checked and we show the move or delete buttons. SO the add item button and the move/delete buttons are the same div for different states.
- Consider numbering the items
- moving items and options should have a small animation to make it clear what is happening
- The swipe label that shows on swipe should probably be centered. Not goes off screen fast. Maybe doesn't need to swipe along?

New top bar design in coding view:
   - Keep the hamburger menu. But inside the menu make it simpler. Just show the top level items (coder questions and unit loops). For unit loop just show [loop label | Units] [current] / total. No dropdown for unit selection and no unit questions. When you click on it you go to the current unit in the loop. 
   - Inside a coder item, we just show the hambuger, and next to it the number of the question, and the two buttons for next and previous.
   - Inside a unit loop it looks the same, but after the hamburger there is an additional button with teh current unit index. Clicking this button opens a pagination menu to navigate units. Perhaps just first, previous, [current index], next, last. And clicking the index allows you to jump to a specific unit.
   - If a job ONLY has a unit loop, then we drop the hamburger. We just show the unit index button and the next/previous buttons.



Currently many confirmations use the browwers confirmation dialog. This is ugly and confusing. We can just make our own dialog that is consistent with our style, right? (maybe the only exception is the leave site warning, but thats fine)

Need to look into the SQL statements. Make them more readable and maintainable. Consier using drizzle?

The dropdown menu for navigation in a job doesn't need to list nubmers next to the items (we still show numbers inside the )

The "research" and "code" button at teh center of the mnu bar have an ugly bottom border to show they are selected. Remove that border.

Great! But lets think more on the navigation desgin:
- The dropdown for the unit loop that shows the pagination, becomes more similar to the hamburger one. At the top it shows the navigation for the unit loop, and below it the list of questions in the unit. 
- The pagination now looks a bit ugly, espeically because of the current / total design. We could also split it over two rows: 
  - Unit 4 of 100  (clicking this cuold open a numpad to jump to a specific unit?)
  - buttons (fist, previous, next, last)
- question: should we make this two buttons, or should the menu for the unit loop be a submenu in the hamburgers? We can still make it so that you can only see the sub menu if we are currently in the unit loop. So if you click on the unit loop in the hamburger it simultaneously opens the sub menu and goes to the current unit in the loop. And if you click the hamburger while in the unit loop it automatically optens the sub menu. We would still need to make it clear that they can go back to the main menu, so either the sub menu replaces the main menu with a back button, or its positioned to the right (possibly hovering over) the main menu.


The session parameters are confusing. Users won't understand ths is where you add url parameters, and participant id settings. It is also probably confusing that you cannot set random conditions here. This is because we supoprt this with auth variables, but it's still confusing if we call it session parameters because that feels like a session variable (we don't make it a session variable because it can be randonly drawn based on another answer). 

So I think "Invitation link parameters" is a better name (internally we use link, but lets use invitation link in UI to make it clearer to users). and if none are set it says something like "Add session variables and participant id". 

The form itself should also be much more minimal and easier to use.
- First we have the participant_id option. This is a single row with inputs:
  - variable name: participant_id (immutable)
  - url parameter: default is "id"
  - Pattern: default is empty, placeholder "optional regex pattern"
- Then we have a block for other url parameters. This is a table with columns:
  - variable name
  - url parameter: default is empty, placeholder "url_parameter"
  - allowed values: A button that when clicked opens a modal that has:
    - type: "fixed list", "unit group", "any value" (at note that fixed list allows auto generating links with all values, and has better validation checks. example: if you have a fixed list with values "control", "experiment", then if you have a condition that aciednetally says variable is "experimenttt" we can catch that and show an error)
    - if list, then a list of allowed values (one per line), if "any value", optional regex
    When the modal is closed, the allowed values column shows a summary of the settings (e.g. "fixed list: 3 values" or "any value: regex pattern").
- Then we have a block for link secret parameters. Here we first briefly explain that these are like hidden url parameters. They are immutable and secret. Best used for things like experimental conditions. Add warning that  This is a table with columns:
  - variable name
  - link secret: default is empty, placeholder "link_secret"
  - allowed values: A button that when clicked opens a modal that has:
    - type: "fixed list", "any value" (at note that fixed list allows auto generating links with all values, and has better validation checks. example: if you have a fixed list with values "control", "experiment", then if you have a condition that aciednetally says variable is "experimenttt" we can catch that and show an error)
    - if list, then a list of allowed values (one per line), if "any value", optional regex
    When the modal is closed, the allowed values column shows a summary of the settings (e.g. "fixed list: 3 values" or "any value: regex pattern").

- Intead of having a "kind" option, we have 

- The general structure is columns: variable name, method, 
- The participant_id option should be at the tope


We should have a clear way to assign units to coders. Currently the appraoch would be:
- Create a unit group where sets are names, and an _overlap value for overlap units. 
- Use this group in the unit loop.
- Also use this group in the invitation link.

This is waaaay to complicated for the most common simple scenario: I want to create three invitation links for my three coders.



session parameters - add link parameters and participant id


Intead of a single "session parameters" form, we'll add 

Differences betwen url params and link params:
- link params are immutable and 

Add invitation link variable: (we call it link internally, but lets call it invitation link in UI for users)
- Set name of variable
- Method: "link secret" or "url parameter" (add quick help that link secret makes the variable immutable and secret. Use url parameters if need to change later (e.g. panel company) or need open values)

A participant id is essentially an invitation link variable, but we'll make it a separate form just for clarity. Also, when we make unique links there is a difference with other invitation link variables. Other variables are 

Add participant id:
- Name is always "participant_id"
- Method: "link secret" or "url parameter" 

We should be more clear when we mean variables. In question items, it shouldn't say "item name" but "variable name". Makes it clear this corresponts to $var
