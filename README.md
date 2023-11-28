# AnnoCate

AnnoCate is a browser-based, mobile-compatible crowd annotation tool, that has been in active development in several forms over the past few years.
it's raison d'être is based on a combination of features that we did not find in existing annotation tools. At it's core, its a convenient tools for creating coding jobs. Over are the days of asking co-authors to help you create training or validation data in Excel sheets. Manual content analysis can be much more efficient and enjoyable if you can do it on your mobile phone whenever the fancy strikes you. AnnoCate supports a wide range of annotation tasks, including complex word-selection tasks, and drawing relations between annotations.

But moreover, AnnoCate is a system for deploying these jobs to a large, untrained crowd, and can even be used for experiments. For example, a researcher can create an invite link that can be distributed by a survey company. One option is then to include participant identifiers to link the annotations to (panel) surveys. But AnnoCate also support integrating survey questions directly inside of codingjobs. Furthermore, the researchers can determine rules for randomly assigning participants to different conditions. This allows one to conduct annotation experiments, either to research the annotation process itself (e.g., annotation bias), or to use annotations as a novel way to investigate attitudes (e.g., do people annotate stances differently if the source is a women).

you can (https://annocate.com/demo?units=introduction&codebook=introduction)[peek here for a quick introduction].

# Development status and history

The current repository is under active development. Early development of this tool started out as a (https://www.opted.eu/fileadmin/user_upload/k_opted/OPTED_Deliverable_D7.2.pdf)[work package of in the OPTED project], where it is one part of the broader AmCAT infrastructure. It has since stayed in active develoment and testing, which has mostly been under the working title AnnoTinder ((https://github.com/ccs-amsterdam/annotinder-client)[client], (https://github.com/ccs-amsterdam/annotinder-server)[server]).

At present it is being re-implemented in this repository, under the name of AnnoCate. The goal of this re-implementation is to clean-up the codebase and features based on current experience in deploying the tool in a number of studies. We're also dropping the separate Python backend in favour of using the fullstack framework NextJS. This will make it easier for people to fire-up their own AnnoCate server.

The authentication for AnnoCate will go through (https://github.com/ccs-amsterdam/middlecat)[Middlecat], which maintains the integration with the AmCAT infrastructure. This can also be used for standalone AnnoCate servers, with the benefit that people that trust us can rely on our Middlecat server, so they do not need to handle authentication themselves.

## Development guide

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
